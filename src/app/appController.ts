import { LEVELS } from '../data/levels';
import type { PartKind } from '../data/parts';
import {
  buyPart,
  buildStats,
  clearOptionalParts,
  createDemoGameModel,
  createInitialGameModel,
  emptyInventory,
  gridBuildStats,
  gridForModel,
  gridVehicleCapacity,
  moveGridPart,
  prepareLevelWorkshop,
  placeGridPart,
  removeGridPart,
  securedGridPlacements,
  vehicleCapacity,
  placePart,
  removePart,
  returnPurchase,
  sellPart,
  validateBuild,
  validateGridBuild,
  type AnchorId,
  type GameModel,
} from '../game/model';
import { applyRideResult, RideSession, STOP_RADIUS_METERS, type RideSnapshot } from '../game/rideSession';
import { generateRequests } from '../game/requests';
import { calculateEngineDamage } from '../game/engineDamage';
import { updateEngineLoad } from '../game/engineLoad';
import { LEVEL_ONE_ARREST_X } from '../game/roadLimits';
import { LocalSaveRepository, createSaveData } from '../persistence/saveRepository';
import { createDemoWorld, createRideWorld } from '../physics/demoWorld';
import { driveForceN, wheelLayoutPenalty } from '../physics/driveModel';
import type { PhysicsWorld, WorldSnapshot } from '../physics/world';
import { AppStateMachine, type AppState } from './appState';

export type AppAction =
  | { readonly type: 'BOOT_COMPLETED' }
  | { readonly type: 'OPEN_LEVEL_SELECT' }
  | { readonly type: 'SELECT_LEVEL'; readonly levelId: string }
  | { readonly type: 'BUY_PART'; readonly kind: PartKind }
  | { readonly type: 'PLACE_PART'; readonly kind: PartKind; readonly anchor: AnchorId }
  | { readonly type: 'REMOVE_PART'; readonly anchor: AnchorId }
  | { readonly type: 'PLACE_GRID_PART'; readonly kind: PartKind; readonly column: number; readonly row: number }
  | { readonly type: 'MOVE_GRID_PART'; readonly placementId: string; readonly column: number; readonly row: number }
  | { readonly type: 'REMOVE_GRID_PART'; readonly placementId: string }
  | { readonly type: 'RETURN_PURCHASE'; readonly kind: PartKind }
  | { readonly type: 'SELL_PART'; readonly kind: PartKind }
  | { readonly type: 'CLEAR_OPTIONAL_PARTS' }
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
  | { readonly type: 'LOAD_DEMO_PROFILE' }
  | { readonly type: 'TOGGLE_REDUCED_MOTION' }
  | { readonly type: 'RESTART_RIDE' }
  | { readonly type: 'TOGGLE_DEBUG' }
  | { readonly type: 'GO_MENU' }
  | { readonly type: 'BACK' };

export interface AppSnapshot {
  readonly state: AppState;
  readonly selectedLevelId: string | null;
  readonly debugEnabled: boolean;
  readonly reducedMotion: boolean;
  readonly game: GameModel;
  readonly ride: RideSnapshot | null;
  readonly vehicleX: number;
  readonly speedMps: number;
  readonly passengerCapacity: number;
  readonly message: string;
  readonly won: boolean | null;
  readonly stars: number | null;
  readonly engineHealthPercent: number;
  readonly engineLoadPercent: number;
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
  #reducedMotion = false;
  #throttle: -1 | 0 | 1 = 0;
  #braking = false;
  #message = '';
  #won: boolean | null = null;
  #stars: number | null = null;
  #engineHealth = 1;
  #engineLoad = 0;
  #chassisContactActive = false;
  #uiElapsed = 0;

  constructor(repository: LocalSaveRepository) {
    this.#repository = repository;
    const saved = repository.load();
    this.#model = saved ? {
      wallet: saved.wallet,
      ownedParts: saved.ownedParts,
      pendingPurchases: saved.pendingPurchases,
      workshopBuild: saved.workshopBuild,
      ...(saved.workshopGrid ? { workshopGrid: saved.workshopGrid } : {}),
      unlockedLevel: saved.unlockedLevel,
      completedLevels: saved.completedLevels,
    } : createInitialGameModel();
    this.#debugEnabled = saved?.settings.debugEnabled ?? false;
    this.#reducedMotion = saved?.settings.reducedMotion ?? false;
    if (repository.recovered) this.#message = 'Guardado inválido recuperado. Se inició una partida segura.';
    this.#machine.subscribe(() => this.#notify());
  }

  get snapshot(): AppSnapshot {
    const world = this.#world.snapshot();
    return {
      state: this.#machine.state,
      selectedLevelId: this.#selectedLevelId,
      debugEnabled: this.#debugEnabled,
      reducedMotion: this.#reducedMotion,
      game: this.#model,
      ride: this.#ride?.snapshot ?? null,
      vehicleX: world.body.position.x,
      speedMps: world.body.velocity.x,
      passengerCapacity: this.#model.workshopGrid
        ? gridVehicleCapacity(gridForModel(this.#model)).passenger
        : vehicleCapacity(this.#model.workshopBuild).passenger,
      message: this.#message,
      won: this.#won,
      stars: this.#stars,
      engineHealthPercent: Math.round(this.#engineHealth * 100),
      engineLoadPercent: Math.round(this.#engineLoad * 100),
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
      const build = gridBuildStats(gridForModel(this.#model));
      const wheelCount = build.wheelOffsets?.length ?? 0;
      const wheelPenalty = wheelLayoutPenalty(build.wheelOffsets ?? []);
      const engineLoad = updateEngineLoad(this.#engineLoad,
        build.engineForceN > 0 && this.#throttle !== 0, durationSeconds);
      this.#engineLoad = engineLoad.load;
      this.#engineHealth = Math.max(0, this.#engineHealth - engineLoad.damage);
      const driveForce = driveForceN(this.#world.snapshot(), {
        throttle: this.#throttle,
        braking: this.#braking,
      }, {
        maxEngineForceN: wheelCount > 0 ? build.engineForceN * this.#engineHealth : 0,
        maxSpeedMps: LEVELS.find((level) => level.id === this.#selectedLevelId)?.maxSpeedMps ?? 5.5,
        brakingForceN: wheelCount > 0 ? 3000 : 800,
        rollingResistanceNPerMps: wheelCount > 0
          ? 125 * wheelPenalty.rollingResistanceMultiplier
          : 900,
        tractionCoefficient: wheelCount > 0
          ? 0.72 * wheelPenalty.tractionMultiplier
          : 0.04,
      });
      this.#world.applyForce({ x: driveForce, y: 0 });
      try {
        this.#world.step(durationSeconds);
        for (const requestId of this.#world.snapshot().lostPayloadIds) {
          if (this.#ride.lose(requestId)) this.#message = 'Una carga se desprendió por el impacto.';
        }
        const world = this.#world.snapshot();
        if (this.#selectedLevelId === 'primer-recorrido' && world.body.position.x <= LEVEL_ONE_ARREST_X) {
          this.#arrestRide();
          return;
        }
        const chassisContacts = world.contacts.filter((contact) => contact.wheelIndex < 0);
        const damage = calculateEngineDamage({
          health: this.#engineHealth,
          durationSeconds,
          chassisContact: chassisContacts.length > 0,
          contactStarted: chassisContacts.length > 0 && !this.#chassisContactActive,
          maximumNormalImpulseNs: Math.max(0, ...chassisContacts.map((contact) => contact.normalImpulseNs)),
          speedMps: world.body.velocity.x,
          driveDemand: this.#throttle !== 0,
        });
        this.#engineHealth = damage.health;
        this.#chassisContactActive = chassisContacts.length > 0;
        if (damage.impactApplied) this.#message = `Motor al ${Math.round(this.#engineHealth * 100)} %.`;
        const arrivals = this.#ride.deliverArrived(world.body.position.x);
        for (const arrival of arrivals) this.#world.detachPayload(arrival.requestId);
        if (arrivals.length > 0) {
          const totalFare = arrivals.reduce((total, arrival) => total + arrival.fare, 0);
          this.#message = `Pasajero en destino: S/ ${totalFare}. Asiento libre.`;
        }
        this.#ride.advance(durationSeconds, world.body.position.x, world.body.angleRadians,
          world.joints.filter((joint) => joint.broken).length);
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
      case 'PLACE_GRID_PART':
        this.#mutateModel(placeGridPart(this.#model, action.kind, action.column, action.row));
        return;
      case 'MOVE_GRID_PART':
        this.#mutateModel(moveGridPart(this.#model, action.placementId, action.column, action.row));
        return;
      case 'REMOVE_GRID_PART':
        this.#mutateModel(removeGridPart(this.#model, action.placementId));
        return;
      case 'RETURN_PURCHASE':
        this.#mutateModel(returnPurchase(this.#model, action.kind));
        return;
      case 'SELL_PART':
        this.#mutateModel(sellPart(this.#model, action.kind));
        return;
      case 'CLEAR_OPTIONAL_PARTS':
        this.#mutateModel(clearOptionalParts(this.#model));
        return;
      case 'START_RIDE':
        this.#startRide();
        return;
      case 'SET_THROTTLE':
        this.#throttle = action.value;
        if (action.value !== 0) this.#braking = false;
        return;
      case 'SET_BRAKE':
        this.#braking = action.value;
        if (action.value) this.#throttle = 0;
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
      case 'LOAD_DEMO_PROFILE':
        this.#loadDemoProfile();
        return;
      case 'TOGGLE_REDUCED_MOTION':
        this.#reducedMotion = !this.#reducedMotion;
        this.#save();
        this.#notify();
        return;
      case 'RESTART_RIDE':
        this.#restartRide();
        return;
      case 'TOGGLE_DEBUG':
        this.#debugEnabled = !this.#debugEnabled;
        this.#save();
        this.#notify();
        return;
      case 'GO_MENU':
        this.#goMenu();
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
    this.#model = prepareLevelWorkshop(this.#model, level.buildBudget, level.defaultExtras);
    this.#message = '';
    this.#save();
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
    const level = LEVELS.find((candidate) => candidate.id === this.#selectedLevelId);
    if (!level) throw new Error('Este recorrido no está disponible.');
    const issue = this.#model.workshopGrid
      ? validateGridBuild(gridForModel(this.#model))
      : validateBuild(this.#model.workshopBuild);
    if (issue) throw new Error(issue);
    this.#createRide(level.id);
    this.#model = { ...this.#model, pendingPurchases: emptyInventory() };
    this.#save();
    this.#machine.transition('PLAYING');
  }

  #createRide(levelId: string): void {
    const level = LEVELS.find((candidate) => candidate.id === levelId);
    if (!level) throw new Error('Este recorrido no está disponible.');
    const grid = gridForModel(this.#model);
    const stats = gridBuildStats(grid);
    const secured = securedGridPlacements(grid);
    this.#world = createRideWorld(level.id, {
      reinforcedSuspension: secured.some((item) => item.kind === 'suspension'),
      roofRack: secured.some((item) => item.kind === 'roofRack'),
      rearCarrier: secured.some((item) => item.kind === 'rearCarrier'),
      bodyMassKg: stats.bodyMassKg,
      centerOfMass: stats.centerOfMass,
      wheelOffsets: stats.wheelOffsets ?? [],
    });
    this.#ride = new RideSession(level.seed, generateRequests(level.id, level.seed),
      level.durationSeconds, level.finishX, stats.loosePieces ?? 0);
    this.#throttle = 0;
    this.#braking = false;
    this.#won = null;
    this.#stars = null;
    this.#engineHealth = 1;
    this.#engineLoad = 0;
    this.#chassisContactActive = false;
    const wheelCount = stats.wheelOffsets?.length ?? 0;
    this.#message = stats.loosePieces
      ? `${stats.loosePieces} pieza${stats.loosePieces === 1 ? '' : 's'} sin conexión cay${stats.loosePieces === 1 ? 'ó' : 'eron'} dentro y no funciona${stats.loosePieces === 1 ? '' : 'n'}.`
      : stats.engineForceN === 0
        ? 'La ruta inició, pero sin motor la combi no puede acelerar.'
        : wheelCount === 0
          ? 'La ruta inició, pero sin ruedas no hay tracción.'
          : '';
  }

  #restartRide(): void {
    if ((this.#machine.state !== 'PLAYING' && this.#machine.state !== 'PAUSED') || !this.#selectedLevelId) {
      throw new Error('No hay un intento para reiniciar.');
    }
    this.#createRide(this.#selectedLevelId);
    this.#message = 'Intento reiniciado.';
    if (this.#machine.state === 'PAUSED') this.#machine.transition('PLAYING');
    else this.#notify();
  }

  #collect(requestId: string): void {
    if (this.#machine.state !== 'PLAYING' || !this.#ride) throw new Error('No hay recorrido activo.');
    const request = this.#ride.snapshot.requests.find((item) => item.request.id === requestId)?.request;
    const jointId = request ? payloadJoint(request.kind) : undefined;
    if (jointId && !this.#world.snapshot().joints.some((joint) =>
      joint.id === jointId && !joint.broken)) {
      throw new Error('El soporte de esta carga está roto. Reinicia o vuelve al taller.');
    }
    const world = this.#world.snapshot();
    this.#ride.collect(requestId, world.body.position.x, world.body.velocity.x,
      this.#model.workshopGrid
        ? gridVehicleCapacity(gridForModel(this.#model))
        : vehicleCapacity(this.#model.workshopBuild));
    if (request) {
      const centerOfMass = this.#model.workshopGrid
        ? gridBuildStats(gridForModel(this.#model)).centerOfMass
        : buildStats(this.#model.workshopBuild).centerOfMass;
      this.#world.attachPayload(request.id, request.massKg,
        payloadOffset(request.kind, centerOfMass), jointId);
    }
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
    this.#stars = result.stars;
    this.#message = result.stars === 3
      ? 'Tres estrellas. Nueva ruta desbloqueada.'
      : `${result.stars} estrella${result.stars === 1 ? '' : 's'}. Consigue tres para avanzar.`;
    this.#throttle = 0;
    this.#save();
    this.#machine.transition('RESULTS');
  }

  #arrestRide(): void {
    this.#won = false;
    this.#stars = 0;
    this.#throttle = 0;
    this.#braking = false;
    this.#message = 'La policía detuvo la combi por salir de la ruta.';
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
    this.#reducedMotion = false;
    this.#message = 'Progreso borrado. Partida nueva lista.';
    this.#notify();
  }

  #loadDemoProfile(): void {
    if (this.#machine.state !== 'MENU') throw new Error('Vuelve al menú para cargar la demostración.');
    this.#model = createDemoGameModel();
    this.#selectedLevelId = null;
    this.#ride = null;
    this.#world = createDemoWorld();
    this.#message = 'Perfil de demostración cargado: campaña y piezas disponibles.';
    this.#save();
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

  #goMenu(): void {
    if (this.#machine.state === 'MENU' || this.#machine.state === 'BOOT') return;
    this.#ride = null;
    this.#selectedLevelId = null;
    this.#world = createDemoWorld();
    this.#throttle = 0;
    this.#braking = false;
    this.#engineHealth = 1;
    this.#engineLoad = 0;
    this.#chassisContactActive = false;
    this.#message = '';
    this.#machine.transition('MENU');
  }

  #save(): void {
    try {
      const save = createSaveData(this.#model, this.#debugEnabled);
      this.#repository.save({ ...save, settings: {
        ...save.settings,
        reducedMotion: this.#reducedMotion,
      } });
    } catch {
      this.#message = 'No se pudo guardar en este navegador. Revisa el almacenamiento local.';
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) listener(this.snapshot);
  }
}

function payloadOffset(kind: 'passenger' | 'roofCargo' | 'scooter',
  centerOfMass: { readonly x: number; readonly y: number }):
{ readonly x: number; readonly y: number } {
  if (kind === 'roofCargo') return { x: -centerOfMass.x, y: 0.75 - centerOfMass.y };
  if (kind === 'scooter') return { x: -1.7 - centerOfMass.x, y: -centerOfMass.y };
  return { x: -centerOfMass.x, y: 0.2 - centerOfMass.y };
}

function payloadJoint(kind: 'passenger' | 'roofCargo' | 'scooter'): string | undefined {
  if (kind === 'roofCargo') return 'roofRack';
  if (kind === 'scooter') return 'rearCarrier';
  return undefined;
}
