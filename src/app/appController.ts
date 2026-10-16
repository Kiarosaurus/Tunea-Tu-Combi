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
  gridPlacementPosition,
  gridVehicleCapacity,
  moveGridPart,
  passengerSeatPlacements,
  prepareLevelWorkshop,
  placeGridPart,
  removeGridPart,
  securedGridPlacements,
  vehicleCapacity,
  placePart,
  removePart,
  refundPart,
  rememberLastRideBuild,
  restoreLastRideBuild,
  validateBuild,
  validateGridBuild,
  type AnchorId,
  type GameModel,
} from '../game/model';
import { applyRideResult, hasReachedDestination, RideSession,
  type RideSnapshot } from '../game/rideSession';
import { generateRequests, personColorForVariant, type FareQuote } from '../game/requests';
import { calculateEngineDamage } from '../game/engineDamage';
import { updateEngineLoad } from '../game/engineLoad';
import { ARREST_X } from '../game/roadLimits';
import { LocalSaveRepository, createSaveData } from '../persistence/saveRepository';
import { createDemoWorld, createMenuShowcaseWorld, createRideWorld } from '../physics/demoWorld';
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
  | { readonly type: 'REFUND_PART'; readonly kind: PartKind }
  | { readonly type: 'CLEAR_OPTIONAL_PARTS' }
  | { readonly type: 'RESTORE_LAST_BUILD' }
  | { readonly type: 'START_RIDE' }
  | { readonly type: 'SET_THROTTLE'; readonly value: -1 | 0 | 1 }
  | { readonly type: 'SET_BRAKE'; readonly value: boolean }
  | { readonly type: 'COLLECT_REQUEST'; readonly requestId: string }
  | { readonly type: 'DELIVER_REQUEST' }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'RETRY' }
  | { readonly type: 'REPLAY_RIDE' }
  | { readonly type: 'ABORT_RIDE' }
  | { readonly type: 'RESET_PROGRESS' }
  | { readonly type: 'LOAD_DEMO_PROFILE' }
  | { readonly type: 'TOGGLE_REDUCED_MOTION' }
  | { readonly type: 'TOGGLE_RIDE_MESSAGES' }
  | { readonly type: 'RESTART_RIDE' }
  | { readonly type: 'TOGGLE_DEBUG' }
  | { readonly type: 'GO_MENU' }
  | { readonly type: 'BACK' };

export interface AppSnapshot {
  readonly state: AppState;
  readonly selectedLevelId: string | null;
  readonly debugEnabled: boolean;
  readonly reducedMotion: boolean;
  readonly rideMessagesEnabled: boolean;
  readonly game: GameModel;
  readonly ride: RideSnapshot | null;
  readonly vehicleX: number;
  readonly speedMps: number;
  readonly passengerCapacity: number;
  readonly message: string;
  readonly messageSource: MessageSource;
  readonly messageColor: string | null;
  readonly pendingMessageCount: number;
  readonly won: boolean | null;
  readonly stars: number | null;
  readonly engineHealthPercent: number;
  readonly engineLoadPercent: number;
  readonly engineVibrationPercent: number;
  readonly brakeEffectivenessPercent: number;
  readonly engineExploded: boolean;
  readonly saveRecovered: boolean;
  readonly fareNotice: FareQuote | null;
  readonly menuShowcaseVariant: number;
  readonly menuShowcaseElapsedSeconds: number;
}

export type MessageSource = 'system' | 'passenger';

interface QueuedMessage {
  readonly text: string;
  readonly source: MessageSource;
  readonly color: string | null;
  readonly durationSeconds: number;
}

const SYSTEM_MESSAGE_SECONDS = 3.6;
const PASSENGER_MESSAGE_SECONDS = 4.2;
const MAX_QUEUED_MESSAGES = 5;

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
  #rideMessagesEnabled = true;
  #throttle: -1 | 0 | 1 = 0;
  #braking = false;
  #brakeStrength = 0;
  #brakePressCount = 0;
  #message = '';
  #messageSource: MessageSource = 'system';
  #messageColor: string | null = null;
  #messageRemainingSeconds = 0;
  #messageQueue: QueuedMessage[] = [];
  #won: boolean | null = null;
  #stars: number | null = null;
  #engineHealth = 1;
  #engineLoad = 0;
  #engineOverloadSeconds = 0;
  #engineOverloadWarningShown = false;
  #engineExploded = false;
  #explosionRemainingSeconds = 0;
  #chassisContactActive = false;
  #uiElapsed = 0;
  #fareNotice: FareQuote | null = null;
  #fareNoticeRemainingSeconds = 0;
  #menuShowcaseVariant = 0;
  #menuShowcaseElapsedSeconds = 0;

  constructor(repository: LocalSaveRepository) {
    this.#repository = repository;
    const saved = repository.load();
    this.#model = saved ? {
      wallet: saved.wallet,
      ownedParts: saved.ownedParts,
      pendingPurchases: saved.pendingPurchases,
      workshopBuild: saved.workshopBuild,
      ...(saved.workshopGrid ? { workshopGrid: saved.workshopGrid } : {}),
      ...(saved.lastRideBuild ? { lastRideBuild: saved.lastRideBuild } : {}),
      unlockedLevel: saved.unlockedLevel,
      completedLevels: saved.completedLevels,
    } : createInitialGameModel();
    this.#debugEnabled = saved?.settings.debugEnabled ?? false;
    this.#reducedMotion = saved?.settings.reducedMotion ?? false;
    this.#rideMessagesEnabled = saved?.settings.rideMessagesEnabled ?? true;
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
      rideMessagesEnabled: this.#rideMessagesEnabled,
      game: this.#model,
      ride: this.#ride?.snapshot ?? null,
      vehicleX: world.body.position.x,
      speedMps: world.body.velocity.x,
      passengerCapacity: this.#model.workshopGrid
        ? gridVehicleCapacity(gridForModel(this.#model)).passenger
        : vehicleCapacity(this.#model.workshopBuild).passenger,
      message: this.#message,
      messageSource: this.#messageSource,
      messageColor: this.#messageColor,
      pendingMessageCount: this.#messageQueue.length,
      won: this.#won,
      stars: this.#stars,
      engineHealthPercent: Math.round(this.#engineHealth * 100),
      engineLoadPercent: Math.round(this.#engineLoad * 100),
      engineVibrationPercent: this.#engineLoad >= 1
        ? Math.round(Math.min(1, this.#engineOverloadSeconds / 8) * 100)
        : 0,
      brakeEffectivenessPercent: this.#braking ? Math.round(this.#brakeStrength * 100) : 0,
      engineExploded: this.#engineExploded,
      saveRecovered: this.#repository.recovered,
      fareNotice: this.#fareNotice,
      menuShowcaseVariant: this.#menuShowcaseVariant,
      menuShowcaseElapsedSeconds: this.#menuShowcaseElapsedSeconds,
    };
  }

  get worldSnapshot(): WorldSnapshot {
    return this.#world.snapshot();
  }

  dispatch(action: AppAction): void {
    try {
      this.#dispatch(action);
    } catch (error) {
      this.#setMessage(error instanceof Error ? error.message : 'No se pudo completar la acción.');
      this.#notify();
    }
  }

  update(durationSeconds: number): void {
    if (this.#machine.state === 'PAUSED' || this.#machine.state === 'RESULTS') return;
    if (this.#machine.state === 'PLAYING' && this.#ride) {
      this.#advanceMessage(durationSeconds);
      this.#fareNoticeRemainingSeconds = Math.max(0,
        this.#fareNoticeRemainingSeconds - durationSeconds);
      if (this.#fareNoticeRemainingSeconds === 0) this.#fareNotice = null;
      if (this.#engineExploded) {
        this.#explosionRemainingSeconds = Math.max(0, this.#explosionRemainingSeconds - durationSeconds);
        if (this.#explosionRemainingSeconds === 0) this.#machine.transition('RESULTS');
        return;
      }
      const build = gridBuildStats(gridForModel(this.#model));
      const wheelCount = build.wheelOffsets?.length ?? 0;
      const wheelPenalty = wheelLayoutPenalty(build.wheelOffsets ?? []);
      const engineLoad = updateEngineLoad(this.#engineLoad,
        build.engineForceN > 0 && this.#throttle !== 0, durationSeconds);
      this.#engineLoad = engineLoad.load;
      this.#engineOverloadSeconds = engineLoad.overloaded
        ? this.#engineOverloadSeconds + durationSeconds
        : 0;
      if (engineLoad.overloaded && !this.#engineOverloadWarningShown) {
        this.#engineOverloadWarningShown = true;
        this.#setMessage('Motor al límite: suelta el acelerador para evitar daños.');
      } else if (!engineLoad.overloaded && this.#engineLoad < 0.92) {
        this.#engineOverloadWarningShown = false;
      }
      this.#engineHealth = Math.max(0, this.#engineHealth - engineLoad.damage);
      if (this.#engineHealth === 0) {
        this.#triggerEngineExplosion();
        return;
      }
      const driveForce = driveForceN(this.#world.snapshot(), {
        throttle: this.#throttle,
        brakeStrength: this.#braking ? this.#brakeStrength : 0,
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
          if (this.#ride.lose(requestId)) {
            const request = this.#ride.snapshot.requests.find((item) =>
              item.request.id === requestId)?.request;
            if (request && request.kind !== 'passenger') {
              this.#world.detachPayload(attendantPayloadId(requestId));
            }
            this.#setMessage('Una carga se desprendió por el impacto.');
          }
        }
        const world = this.#world.snapshot();
        if (world.body.position.x <= ARREST_X) {
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
        if (damage.impactApplied) this.#setMessage(`Motor al ${Math.round(this.#engineHealth * 100)} %.`);
        if (this.#engineHealth === 0) {
          this.#triggerEngineExplosion();
          return;
        }
        const arrivals = this.#ride.deliverArrived(world.body.position.x);
        for (const arrival of arrivals) this.#detachRequestPayload(arrival.requestId);
        if (arrivals.length > 0) {
          const wrongRoute = arrivals.find((arrival) => !arrival.servedByRoute);
          if (wrongRoute) {
            const speaker = this.#ride.snapshot.requests.find((progress) =>
              progress.request.id === wrongRoute.requestId)?.request;
            this.#setMessage(`Te dije ${wrongRoute.destinationStop}. Esta combi no va. No te pago.`,
              'passenger', personColorForVariant(speaker?.attendantVariant ?? ''));
          } else {
            const count = arrivals.length;
            this.#setMessage(count === 1
              ? 'Se desocupó un asiento: bajó un pasajero.'
              : `Se desocuparon ${count} asientos: bajaron ${count} pasajeros.`);
          }
        }
        this.#ride.advance(durationSeconds, world.body.position.x, world.body.angleRadians,
          world.joints.filter((joint) => joint.broken).length);
      } catch {
        this.#setMessage('La simulación se detuvo para proteger la partida.');
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
    if (this.#machine.state === 'MENU') {
      this.#menuShowcaseElapsedSeconds += durationSeconds;
      this.#world.applyForce({ x: 720, y: 0 });
      this.#world.step(durationSeconds);
      if (this.#menuShowcaseElapsedSeconds >= 2) {
        this.#menuShowcaseElapsedSeconds -= 2;
        this.#menuShowcaseVariant = (this.#menuShowcaseVariant + 1) % 4;
        this.#world = createMenuShowcaseWorld(this.#menuShowcaseVariant);
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
      case 'REFUND_PART':
        this.#mutateModel(refundPart(this.#model, action.kind));
        return;
      case 'CLEAR_OPTIONAL_PARTS':
        this.#mutateModel(clearOptionalParts(this.#model));
        return;
      case 'RESTORE_LAST_BUILD':
        this.#restoreLastBuild();
        return;
      case 'START_RIDE':
        this.#startRide();
        return;
      case 'SET_THROTTLE':
        this.#throttle = action.value;
        if (action.value !== 0) this.#braking = false;
        return;
      case 'SET_BRAKE':
        if (action.value && !this.#braking) {
          const strengths = [0.25, 0.5, 0.75, 1] as const;
          this.#brakeStrength = strengths[this.#brakePressCount % strengths.length] ?? 0.25;
          this.#brakePressCount += 1;
        }
        this.#braking = action.value;
        if (action.value) this.#throttle = 0;
        this.#notify();
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
      case 'REPLAY_RIDE':
        if (this.#machine.state !== 'RESULTS' || !this.#selectedLevelId) {
          throw new Error('Termina un recorrido antes de reintentarlo.');
        }
        this.#createRide(this.#selectedLevelId);
        this.#setMessage('Nuevo intento. Misma combi, nueva oportunidad.');
        this.#machine.transition('PLAYING');
        return;
      case 'ABORT_RIDE':
        if (this.#machine.state !== 'PAUSED') throw new Error('Pausa antes de salir del recorrido.');
        this.#ride = null;
        this.#world = createDemoWorld();
        this.#setMessage('¡Ya pe! Métele mano a la combi y vuelve con todo.');
        this.#machine.transition('WORKSHOP');
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
      case 'TOGGLE_RIDE_MESSAGES':
        this.#rideMessagesEnabled = !this.#rideMessagesEnabled;
        if (!this.#rideMessagesEnabled) this.#clearRideMessages();
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
    this.#setMessage('');
    this.#save();
    this.#machine.transition('WORKSHOP');
  }

  #mutateModel(model: GameModel): void {
    if (this.#machine.state !== 'WORKSHOP') throw new Error('Abre el taller para modificar piezas.');
    this.#model = model;
    this.#setMessage('');
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
    this.#model = rememberLastRideBuild(this.#model);
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
    this.#brakeStrength = 0;
    this.#brakePressCount = 0;
    this.#won = null;
    this.#stars = null;
    this.#engineHealth = 1;
    this.#engineLoad = 0;
    this.#engineOverloadSeconds = 0;
    this.#engineOverloadWarningShown = false;
    this.#engineExploded = false;
    this.#explosionRemainingSeconds = 0;
    this.#chassisContactActive = false;
    this.#fareNotice = null;
    this.#fareNoticeRemainingSeconds = 0;
    const wheelCount = stats.wheelOffsets?.length ?? 0;
    this.#setMessage(stats.loosePieces
      ? `${stats.loosePieces} pieza${stats.loosePieces === 1 ? '' : 's'} sin conexión cay${stats.loosePieces === 1 ? 'ó' : 'eron'} dentro y no funciona${stats.loosePieces === 1 ? '' : 'n'}.`
      : stats.engineForceN === 0
        ? 'La ruta inició, pero sin motor la combi no puede acelerar.'
        : wheelCount === 0
          ? 'La ruta inició, pero sin ruedas no hay tracción.'
          : '');
  }

  #restartRide(): void {
    if ((this.#machine.state !== 'PLAYING' && this.#machine.state !== 'PAUSED') || !this.#selectedLevelId) {
      throw new Error('No hay un intento para reiniciar.');
    }
    this.#createRide(this.#selectedLevelId);
    this.#setMessage('Intento reiniciado.');
    if (this.#machine.state === 'PAUSED') this.#machine.transition('PLAYING');
    else this.#notify();
  }

  #collect(requestId: string): void {
    if (this.#machine.state !== 'PLAYING' || !this.#ride) throw new Error('No hay recorrido activo.');
    const request = this.#ride.snapshot.requests.find((item) => item.request.id === requestId)?.request;
    const jointId = request ? payloadJoint(request.kind) : undefined;
    const supportJoint = jointId
      ? this.#world.snapshot().joints.find((joint) => joint.id === jointId)
      : undefined;
    if (supportJoint?.broken) {
      throw new Error('El soporte de esta carga está roto. Reinicia o vuelve al taller.');
    }
    const world = this.#world.snapshot();
    const fareQuote = this.#ride.collect(requestId, world.body.position.x, world.body.velocity.x,
      this.#model.workshopGrid
        ? gridVehicleCapacity(gridForModel(this.#model))
        : vehicleCapacity(this.#model.workshopBuild));
    if (request) {
      const grid = gridForModel(this.#model);
      const centerOfMass = this.#model.workshopGrid
        ? gridBuildStats(gridForModel(this.#model)).centerOfMass
        : buildStats(this.#model.workshopBuild).centerOfMass;
      const occupiedSeats = this.#ride.snapshot.requests.filter((item) =>
        item.status === 'onboard').length - 1;
      const seat = passengerSeatPlacements(grid)[Math.max(0, occupiedSeats)];
      const seatPosition = seat ? gridPlacementPosition(seat) : undefined;
      if (request.kind === 'passenger') {
        this.#world.attachPayload(request.id, request.massKg,
          passengerPayloadOffset(centerOfMass, seatPosition));
      } else {
        this.#world.attachPayload(request.id, request.cargoMassKg,
          cargoPayloadOffset(request.kind, centerOfMass), jointId);
        this.#world.attachPayload(attendantPayloadId(request.id),
          request.massKg - request.cargoMassKg,
          passengerPayloadOffset(centerOfMass, seatPosition));
      }
    }
    if (request?.servedByRoute) {
      this.#fareNotice = fareQuote;
      this.#fareNoticeRemainingSeconds = 1.8;
    }
    this.#setMessage(request?.kind === 'passenger'
      ? request.servedByRoute
        ? `Voy a ${request.destinationStop}.`
        : `Esta combi no va a ${request.destinationStop}. Me bajaré luego.`
      : 'Carga asegurada. Llévala a su destino.', request?.kind === 'passenger'
      ? 'passenger' : 'system', request?.kind === 'passenger'
      ? personColorForVariant(request.attendantVariant) : null);
    this.#notify();
  }

  #deliver(): void {
    if (this.#machine.state !== 'PLAYING' || !this.#ride) throw new Error('No hay recorrido activo.');
    const vehicleX = this.#world.snapshot().body.position.x;
    const request = this.#ride.snapshot.requests.find((item) => item.status === 'onboard' &&
      hasReachedDestination(vehicleX, item.request.destinationX))?.request;
    const fare = this.#ride.deliver(vehicleX);
    if (request) this.#detachRequestPayload(request.id);
    this.#setMessage(`Entrega completada: S/ ${fare}.`);
    this.#notify();
  }

  #finishRide(): void {
    if (!this.#ride || !this.#selectedLevelId) return;
    const result = applyRideResult(this.#model, this.#ride.snapshot, this.#selectedLevelId);
    this.#model = result.model;
    this.#won = result.won;
    this.#stars = result.stars;
    this.#setMessage(result.stars === 3
      ? 'Tres estrellas. Nueva ruta desbloqueada.'
      : `${result.stars} estrella${result.stars === 1 ? '' : 's'}. Consigue tres para avanzar.`,
    'system', null, true);
    this.#throttle = 0;
    this.#save();
    this.#machine.transition('RESULTS');
  }

  #detachRequestPayload(requestId: string): void {
    const request = this.#ride?.snapshot.requests.find((item) =>
      item.request.id === requestId)?.request;
    this.#world.detachPayload(requestId);
    if (request && request.kind !== 'passenger') {
      this.#world.detachPayload(attendantPayloadId(requestId));
    }
  }

  #arrestRide(): void {
    this.#won = false;
    this.#stars = 0;
    this.#throttle = 0;
    this.#braking = false;
    this.#setMessage('La policía detuvo la combi por salir de la ruta.', 'system', null, true);
    this.#machine.transition('RESULTS');
  }

  #triggerEngineExplosion(): void {
    this.#engineHealth = 0;
    this.#engineExploded = true;
    this.#explosionRemainingSeconds = 0.8;
    this.#won = false;
    this.#stars = 0;
    this.#throttle = 0;
    this.#braking = false;
    this.#setMessage('El motor explotó. La combi quedó fuera de servicio.', 'system', null, true);
    this.#notify();
  }

  #resetProgress(): void {
    if (this.#machine.state !== 'MENU') throw new Error('Vuelve al menú para borrar el progreso.');
    this.#repository.clear();
    this.#model = createInitialGameModel();
    this.#selectedLevelId = null;
    this.#ride = null;
    this.#world = createDemoWorld();
    this.#menuShowcaseVariant = 0;
    this.#menuShowcaseElapsedSeconds = 0;
    this.#debugEnabled = false;
    this.#reducedMotion = false;
    this.#rideMessagesEnabled = true;
    this.#setMessage('Progreso borrado. Partida nueva lista.');
    this.#notify();
  }

  #loadDemoProfile(): void {
    if (this.#machine.state !== 'MENU') throw new Error('Vuelve al menú para cargar la demostración.');
    this.#model = createDemoGameModel();
    this.#selectedLevelId = null;
    this.#ride = null;
    this.#world = createDemoWorld();
    this.#menuShowcaseVariant = 0;
    this.#menuShowcaseElapsedSeconds = 0;
    this.#setMessage('Perfil de demostración cargado: campaña y piezas disponibles.');
    this.#save();
    this.#notify();
  }

  #goBack(): void {
    if (this.#machine.state === 'LEVEL_SELECT') {
      this.#world = createDemoWorld();
      this.#menuShowcaseVariant = 0;
      this.#menuShowcaseElapsedSeconds = 0;
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
    this.#menuShowcaseVariant = 0;
    this.#menuShowcaseElapsedSeconds = 0;
    this.#throttle = 0;
    this.#braking = false;
    this.#brakeStrength = 0;
    this.#brakePressCount = 0;
    this.#engineHealth = 1;
    this.#engineLoad = 0;
    this.#engineOverloadSeconds = 0;
    this.#engineOverloadWarningShown = false;
    this.#engineExploded = false;
    this.#explosionRemainingSeconds = 0;
    this.#chassisContactActive = false;
    this.#setMessage('');
    this.#machine.transition('MENU');
  }

  #save(): void {
    try {
      const save = createSaveData(this.#model, this.#debugEnabled);
      this.#repository.save({ ...save, settings: {
        ...save.settings,
        reducedMotion: this.#reducedMotion,
        rideMessagesEnabled: this.#rideMessagesEnabled,
      } });
    } catch {
      this.#setMessage('No se pudo guardar en este navegador. Revisa el almacenamiento local.');
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) listener(this.snapshot);
  }

  #restoreLastBuild(): void {
    if (this.#machine.state !== 'WORKSHOP') throw new Error('Abre el taller para recuperar el arreglo.');
    this.#model = restoreLastRideBuild(this.#model);
    this.#setMessage('Último arreglo recuperado. Revisa el presupuesto y sal a rodar.');
    this.#save();
    this.#notify();
  }

  #setMessage(message: string, source: MessageSource = 'system', color: string | null = null,
    replace = false): void {
    if (!message) {
      this.#clearRideMessages();
      return;
    }
    const entry: QueuedMessage = {
      text: message,
      source,
      color: source === 'passenger' ? color : null,
      durationSeconds: source === 'passenger' ? PASSENGER_MESSAGE_SECONDS : SYSTEM_MESSAGE_SECONDS,
    };
    if (this.#machine.state === 'PLAYING' && !this.#rideMessagesEnabled && !replace) return;
    if (!replace && this.#machine.state === 'PLAYING' && this.#message) {
      const duplicate = this.#message === entry.text ||
        this.#messageQueue.some((queued) => queued.text === entry.text);
      if (source === 'passenger') {
        if (this.#messageSource !== 'passenger') {
          this.#messageQueue = [];
          this.#showMessage(entry);
        } else if (!duplicate && this.#messageQueue.length < MAX_QUEUED_MESSAGES) {
          this.#messageQueue.push(entry);
        }
      }
      return;
    }
    this.#messageQueue = [];
    this.#showMessage(entry);
  }

  #advanceMessage(durationSeconds: number): void {
    if (!this.#message) return;
    this.#messageRemainingSeconds = Math.max(0, this.#messageRemainingSeconds - durationSeconds);
    if (this.#messageRemainingSeconds > 0) return;
    const next = this.#messageQueue.shift();
    if (next) this.#showMessage(next);
    else this.#clearRideMessages();
  }

  #showMessage(entry: QueuedMessage): void {
    this.#message = entry.text;
    this.#messageSource = entry.source;
    this.#messageColor = entry.color;
    this.#messageRemainingSeconds = entry.durationSeconds;
  }

  #clearRideMessages(): void {
    this.#message = '';
    this.#messageSource = 'system';
    this.#messageColor = null;
    this.#messageRemainingSeconds = 0;
    this.#messageQueue = [];
  }
}

function passengerPayloadOffset(centerOfMass: { readonly x: number; readonly y: number },
  seatPosition?: { readonly x: number; readonly y: number }):
{ readonly x: number; readonly y: number } {
  return seatPosition
    ? { x: seatPosition.x - centerOfMass.x, y: seatPosition.y - centerOfMass.y }
    : { x: -centerOfMass.x, y: 0.2 - centerOfMass.y };
}

function cargoPayloadOffset(kind: 'roofCargo' | 'scooter',
  centerOfMass: { readonly x: number; readonly y: number }):
{ readonly x: number; readonly y: number } {
  if (kind === 'roofCargo') return { x: -1.05 - centerOfMass.x, y: 0.75 - centerOfMass.y };
  return { x: -1.7 - centerOfMass.x, y: -centerOfMass.y };
}

function attendantPayloadId(requestId: string): string {
  return `${requestId}:attendant`;
}

function payloadJoint(kind: 'passenger' | 'roofCargo' | 'scooter'): string | undefined {
  if (kind === 'roofCargo') return 'roofRack';
  if (kind === 'scooter') return 'rearCarrier';
  return undefined;
}
