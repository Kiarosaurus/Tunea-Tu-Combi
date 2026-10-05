import { LEVELS } from '../data/levels';
import type { PartKind } from '../data/parts';
import {
  buyPart,
  createInitialGameModel,
  emptyInventory,
  vehicleCapacity,
  placePart,
  removePart,
  returnPurchase,
  sellPart,
  validateBuild,
  type AnchorId,
  type GameModel,
} from '../game/model';
import { applyRideResult, RideSession, STOP_RADIUS_METERS, type RideSnapshot } from '../game/rideSession';
import { LocalSaveRepository, createSaveData } from '../persistence/saveRepository';
import { createDemoWorld, createLevelOneWorld } from '../physics/demoWorld';
import { driveForceN } from '../physics/driveModel';
import type { PhysicsWorld, WorldSnapshot } from '../physics/world';
import { AppStateMachine, type AppState } from './appState';

export type AppAction =
  | { readonly type: 'BOOT_COMPLETED' }
  | { readonly type: 'OPEN_LEVEL_SELECT' }
  | { readonly type: 'SELECT_LEVEL'; readonly levelId: string }
  | { readonly type: 'BUY_PART'; readonly kind: PartKind }
  | { readonly type: 'PLACE_PART'; readonly kind: PartKind; readonly anchor: AnchorId }
  | { readonly type: 'REMOVE_PART'; readonly anchor: AnchorId }
  | { readonly type: 'RETURN_PURCHASE'; readonly kind: PartKind }
  | { readonly type: 'SELL_PART'; readonly kind: PartKind }
  | { readonly type: 'START_RIDE' }
  | { readonly type: 'SET_THROTTLE'; readonly value: -1 | 0 | 1 }
  | { readonly type: 'SET_BRAKE'; readonly value: boolean }
  | { readonly type: 'COLLECT_REQUEST'; readonly requestId: string }
  | { readonly type: 'DELIVER_REQUEST' }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'RETRY' }
  | { readonly type: 'ABORT_RIDE' }
  | { readonly type: 'RESET_PROGRESS' }
  | { readonly type: 'TOGGLE_DEBUG' }
  | { readonly type: 'BACK' };

export interface AppSnapshot {
  readonly state: AppState;
  readonly selectedLevelId: string | null;
  readonly debugEnabled: boolean;
  readonly game: GameModel;
  readonly ride: RideSnapshot | null;
  readonly vehicleX: number;
  readonly speedMps: number;
  readonly message: string;
  readonly won: boolean | null;
  readonly saveRecovered: boolean;
}

export class AppController {
  readonly #machine = new AppStateMachine();
  readonly #listeners = new Set<(snapshot: AppSnapshot) => void>();
  readonly #repository: LocalSaveRepository;
  #model: GameModel;
  #world: PhysicsWorld = createDemoWorld();
  #ride: RideSession | null = null;
  #selectedLevelId: string | null = null;
  #debugEnabled = false;
  #throttle: -1 | 0 | 1 = 0;
  #braking = false;
  #message = '';
  #won: boolean | null = null;
  #uiElapsed = 0;

  constructor(repository: LocalSaveRepository) {
    this.#repository = repository;
    const saved = repository.load();
    this.#model = saved ? {
      wallet: saved.wallet,
      ownedParts: saved.ownedParts,
      pendingPurchases: saved.pendingPurchases,
      workshopBuild: saved.workshopBuild,
      unlockedLevel: saved.unlockedLevel,
      completedLevels: saved.completedLevels,
    } : createInitialGameModel();
    this.#debugEnabled = saved?.settings.debugEnabled ?? false;
    if (repository.recovered) this.#message = 'Guardado inválido recuperado. Se inició una partida segura.';
    this.#machine.subscribe(() => this.#notify());
  }

  get snapshot(): AppSnapshot {
    const world = this.#world.snapshot();
    return {
      state: this.#machine.state,
      selectedLevelId: this.#selectedLevelId,
      debugEnabled: this.#debugEnabled,
      game: this.#model,
      ride: this.#ride?.snapshot ?? null,
      vehicleX: world.body.position.x,
      speedMps: world.body.velocity.x,
      message: this.#message,
      won: this.#won,
      saveRecovered: this.#repository.recovered,
    };
  }

  get worldSnapshot(): WorldSnapshot {
    return this.#world.snapshot();
  }

  dispatch(action: AppAction): void {
    try {
      this.#dispatch(action);
    } catch (error) {
      this.#message = error instanceof Error ? error.message : 'No se pudo completar la acción.';
      this.#notify();
    }
  }

  update(durationSeconds: number): void {
    if (this.#machine.state === 'PAUSED' || this.#machine.state === 'RESULTS') return;
    if (this.#machine.state === 'PLAYING' && this.#ride) {
      const driveForce = driveForceN(this.#world.snapshot(), {
        throttle: this.#throttle,
        braking: this.#braking,
      });
      this.#world.applyForce({ x: driveForce, y: 0 });
      try {
        this.#world.step(durationSeconds);
        for (const requestId of this.#world.snapshot().lostPayloadIds) {
          if (this.#ride.lose(requestId)) this.#message = 'Una carga se desprendió por el impacto.';
        }
        this.#ride.advance(durationSeconds, this.#world.snapshot().body.position.x);
      } catch {
        this.#message = 'La simulación se detuvo para proteger la partida.';
        this.#machine.transition('RESULTS');
        this.#won = false;
        return;
      }
      if (this.#ride.snapshot.finished) {
        this.#finishRide();
        return;
      }
      this.#uiElapsed += durationSeconds;
      if (this.#uiElapsed >= 0.1) {
        this.#uiElapsed = 0;
        this.#notify();
      }
      return;
    }
    this.#world.step(durationSeconds);
    if (this.#world.snapshot().body.position.x > 16) this.#world = createDemoWorld();
  }

  subscribe(listener: (snapshot: AppSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }

  #dispatch(action: AppAction): void {
    switch (action.type) {
      case 'BOOT_COMPLETED':
        this.#machine.transition('MENU');
        return;
      case 'OPEN_LEVEL_SELECT':
        this.#machine.transition('LEVEL_SELECT');
        return;
      case 'SELECT_LEVEL':
        this.#selectLevel(action.levelId);
        return;
      case 'BUY_PART':
        this.#mutateModel(buyPart(this.#model, action.kind));
        return;
      case 'PLACE_PART':
        this.#mutateModel(placePart(this.#model, action.kind, action.anchor));
        return;
      case 'REMOVE_PART':
        this.#mutateModel(removePart(this.#model, action.anchor));
        return;
      case 'RETURN_PURCHASE':
        this.#mutateModel(returnPurchase(this.#model, action.kind));
        return;
      case 'SELL_PART':
        this.#mutateModel(sellPart(this.#model, action.kind));
        return;
      case 'START_RIDE':
        this.#startRide();
        return;
      case 'SET_THROTTLE':
        this.#throttle = action.value;
        return;
      case 'SET_BRAKE':
        this.#braking = action.value;
        return;
      case 'COLLECT_REQUEST':
        this.#collect(action.requestId);
        return;
      case 'DELIVER_REQUEST':
        this.#deliver();
        return;
      case 'PAUSE':
        this.#throttle = 0;
        this.#braking = false;
        this.#machine.transition('PAUSED');
        return;
      case 'RESUME':
        this.#machine.transition('PLAYING');
        return;
      case 'RETRY':
        if (this.#machine.state !== 'RESULTS') throw new Error('Termina el intento antes de reintentar.');
        this.#ride = null;
        this.#world = createDemoWorld();
        this.#machine.transition('WORKSHOP');
        return;
      case 'ABORT_RIDE':
        if (this.#machine.state !== 'PAUSED') throw new Error('Pausa antes de salir del recorrido.');
        this.#ride = null;
        this.#world = createDemoWorld();
        this.#message = 'Intento cancelado. Las compras se conservan.';
        this.#machine.transition('RESULTS');
        this.#won = false;
        return;
      case 'RESET_PROGRESS':
        this.#resetProgress();
        return;
      case 'TOGGLE_DEBUG':
        this.#debugEnabled = !this.#debugEnabled;
        this.#save();
        this.#notify();
        return;
      case 'BACK':
        this.#goBack();
        return;
    }
  }

  #selectLevel(levelId: string): void {
    const level = LEVELS.find((candidate) => candidate.id === levelId);
    if (!level) throw new Error(`Nivel desconocido: ${levelId}`);
    if (level.number > this.#model.unlockedLevel) throw new Error('Este nivel está bloqueado.');
    this.#selectedLevelId = level.id;
    this.#message = '';
    this.#machine.transition('WORKSHOP');
  }

  #mutateModel(model: GameModel): void {
    if (this.#machine.state !== 'WORKSHOP') throw new Error('Abre el taller para modificar piezas.');
    this.#model = model;
    this.#message = '';
    this.#save();
    this.#notify();
  }

  #startRide(): void {
    if (this.#machine.state !== 'WORKSHOP') throw new Error('Abre el taller antes de iniciar.');
    if (this.#selectedLevelId !== 'primer-recorrido') throw new Error('Este recorrido estará disponible en una siguiente etapa.');
    const issue = validateBuild(this.#model.workshopBuild);
    if (issue) throw new Error(issue);
    this.#world = createLevelOneWorld({
      reinforcedSuspension: this.#model.workshopBuild.suspension === 'suspension',
      roofRack: this.#model.workshopBuild.roof === 'roofRack',
      rearCarrier: this.#model.workshopBuild.rearCarrier === 'rearCarrier',
    });
    this.#ride = new RideSession();
    this.#throttle = 0;
    this.#braking = false;
    this.#won = null;
    this.#message = '';
    this.#model = { ...this.#model, pendingPurchases: emptyInventory() };
    this.#save();
    this.#machine.transition('PLAYING');
  }

  #collect(requestId: string): void {
    if (this.#machine.state !== 'PLAYING' || !this.#ride) throw new Error('No hay recorrido activo.');
    const request = this.#ride.snapshot.requests.find((item) => item.request.id === requestId)?.request;
    this.#ride.collect(requestId, this.#world.snapshot().body.position.x,
      vehicleCapacity(this.#model.workshopBuild));
    if (request) this.#world.attachPayload(request.id, request.massKg,
      payloadOffset(request.kind), payloadJoint(request.kind));
    this.#message = request?.kind === 'passenger'
      ? 'Pasajero a bordo. Llévalo a su destino.'
      : 'Carga asegurada. Llévala a su destino.';
    this.#notify();
  }

  #deliver(): void {
    if (this.#machine.state !== 'PLAYING' || !this.#ride) throw new Error('No hay recorrido activo.');
    const vehicleX = this.#world.snapshot().body.position.x;
    const request = this.#ride.snapshot.requests.find((item) => item.status === 'onboard' &&
      Math.abs(vehicleX - item.request.destinationX) <= STOP_RADIUS_METERS)?.request;
    const fare = this.#ride.deliver(vehicleX);
    if (request) this.#world.detachPayload(request.id);
    this.#message = `Entrega completada: S/ ${fare}.`;
    this.#notify();
  }

  #finishRide(): void {
    if (!this.#ride || !this.#selectedLevelId) return;
    const result = applyRideResult(this.#model, this.#ride.snapshot, this.#selectedLevelId);
    this.#model = result.model;
    this.#won = result.won;
    this.#message = result.won ? 'Cuota alcanzada.' : 'No alcanzaste la cuota. Puedes reintentar.';
    this.#throttle = 0;
    this.#save();
    this.#machine.transition('RESULTS');
  }

  #resetProgress(): void {
    if (this.#machine.state !== 'MENU') throw new Error('Vuelve al menú para borrar el progreso.');
    this.#repository.clear();
    this.#model = createInitialGameModel();
    this.#selectedLevelId = null;
    this.#ride = null;
    this.#world = createDemoWorld();
    this.#debugEnabled = false;
    this.#message = 'Progreso borrado. Partida nueva lista.';
    this.#notify();
  }

  #goBack(): void {
    if (this.#machine.state === 'LEVEL_SELECT') {
      this.#machine.transition('MENU');
      return;
    }
    if (this.#machine.state === 'WORKSHOP') {
      this.#machine.transition('LEVEL_SELECT');
      return;
    }
    if (this.#machine.state === 'RESULTS') {
      this.#machine.transition('LEVEL_SELECT');
      return;
    }
    throw new Error(`No se puede volver desde ${this.#machine.state}`);
  }

  #save(): void {
    try {
      this.#repository.save(createSaveData(this.#model, this.#debugEnabled));
    } catch {
      this.#message = 'No se pudo guardar en este navegador. Revisa el almacenamiento local.';
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) listener(this.snapshot);
  }
}

function payloadOffset(kind: 'passenger' | 'roofCargo' | 'scooter'):
{ readonly x: number; readonly y: number } {
  if (kind === 'roofCargo') return { x: 0, y: 0.75 };
  if (kind === 'scooter') return { x: -1.7, y: 0 };
  return { x: 0, y: 0 };
}

function payloadJoint(kind: 'passenger' | 'roofCargo' | 'scooter'): string | undefined {
  if (kind === 'roofCargo') return 'roofRack';
  if (kind === 'scooter') return 'rearCarrier';
  return undefined;
}
