import { describe, expect, it } from 'vitest';
import { LocalSaveRepository, type StorageLike } from '../persistence/saveRepository';
import { createSaveData } from '../persistence/saveRepository';
import { createDemoGameModel, createInitialGameModel, gridBuildStats, gridForModel, placeGridPart } from '../game/model';
import { AppController } from './appController';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function enterWorkshop(controller: AppController, assemble = true): void {
  controller.dispatch({ type: 'BOOT_COMPLETED' });
  controller.dispatch({ type: 'OPEN_LEVEL_SELECT' });
  controller.dispatch({ type: 'SELECT_LEVEL', levelId: 'primer-recorrido' });
  if (assemble) assembleBaseVehicle(controller);
}

function assembleBaseVehicle(controller: AppController): void {
  controller.dispatch({ type: 'PLACE_GRID_PART', kind: 'wheel', column: 1, row: 5 });
  controller.dispatch({ type: 'PLACE_GRID_PART', kind: 'wheel', column: 7, row: 5 });
  controller.dispatch({ type: 'PLACE_GRID_PART', kind: 'engine', column: 6, row: 3 });
  controller.dispatch({ type: 'PLACE_GRID_PART', kind: 'seat', column: 3, row: 3 });
}

function addPassengerSeat(controller: AppController): void {
  controller.dispatch({ type: 'BUY_PART', kind: 'seat' });
  controller.dispatch({ type: 'PLACE_GRID_PART', kind: 'seat', column: 4, row: 3 });
}

function addCargoSupports(controller: AppController, suspension = false): void {
  addPassengerSeat(controller);
  controller.dispatch({ type: 'BUY_PART', kind: 'roofRack' });
  controller.dispatch({ type: 'PLACE_GRID_PART', kind: 'roofRack', column: 2, row: 2 });
  controller.dispatch({ type: 'BUY_PART', kind: 'rearCarrier' });
  controller.dispatch({ type: 'PLACE_GRID_PART', kind: 'rearCarrier', column: 0, row: 4 });
  if (suspension) {
    controller.dispatch({ type: 'BUY_PART', kind: 'suspension' });
    controller.dispatch({ type: 'PLACE_GRID_PART', kind: 'suspension', column: 4, row: 5 });
  }
}

function completeRide(controller: AppController): void {
  controller.dispatch({ type: 'SET_THROTTLE', value: 1 });
  for (let index = 0; index < 3700 && controller.snapshot.state === 'PLAYING'; index += 1) {
    controller.update(1 / 60);
    const snapshot = controller.snapshot;
    const waiting = snapshot.ride?.requests.find((progress) => progress.status === 'waiting');
    if (waiting) {
      const distance = waiting.request.originX - snapshot.vehicleX;
      const shouldBrake = distance < Math.max(2.5, Math.abs(snapshot.speedMps) * 1.35) &&
        distance > -2.3;
      controller.dispatch({ type: 'SET_THROTTLE', value: shouldBrake ? 0 : 1 });
      controller.dispatch({ type: 'SET_BRAKE', value: shouldBrake });
      if (Math.abs(distance) < 2.3 && Math.abs(snapshot.speedMps) <= 0.35) {
        controller.dispatch({ type: 'COLLECT_REQUEST', requestId: waiting.request.id });
        controller.dispatch({ type: 'SET_BRAKE', value: false });
        controller.dispatch({ type: 'SET_THROTTLE', value: 1 });
      }
    } else {
      controller.dispatch({ type: 'SET_BRAKE', value: false });
      controller.dispatch({ type: 'SET_THROTTLE', value: 1 });
    }
  }
}

function fullyEquippedModel(unlockedLevel: number) {
  const model = createDemoGameModel();
  return {
    ...model,
    unlockedLevel,
  };
}

function modelWithPassenger(unlockedLevel: number) {
  const model = createInitialGameModel();
  return placeGridPart({
    ...model,
    unlockedLevel,
    ownedParts: { ...model.ownedParts, seat: 2 },
  }, 'seat', 0, 4);
}

describe('flujo vertical del primer recorrido', () => {
  it('compra, completa la cuota, desbloquea nivel 2 y persiste tras recargar', () => {
    const storage = memoryStorage();
    const controller = new AppController(new LocalSaveRepository(storage));
    enterWorkshop(controller);
    addCargoSupports(controller);
    controller.dispatch({ type: 'START_RIDE' });
    expect(controller.snapshot.state).toBe('PLAYING');
    completeRide(controller);

    expect(controller.snapshot.state).toBe('RESULTS');
    expect(controller.snapshot.won).toBe(true);
    expect(controller.snapshot.ride?.deliveredRevenue).toBeGreaterThanOrEqual(6);
    expect(controller.snapshot.game.unlockedLevel).toBe(2);
    expect(controller.snapshot.ride?.maximumPayloadMassKg).toBeGreaterThan(0);

    const reloaded = new AppController(new LocalSaveRepository(storage));
    expect(reloaded.snapshot.game.wallet).toBe(controller.snapshot.game.wallet);
    expect(reloaded.snapshot.game.unlockedLevel).toBe(2);
    expect(reloaded.snapshot.game.workshopBuild.passengerSeat).toBe('seat');
  });

  it('abre cada nivel con la cuadrícula vacía y el kit en la paleta', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller, false);
    expect(gridForModel(controller.snapshot.game)).toEqual([]);
    expect(controller.snapshot.game.ownedParts).toMatchObject({ wheel: 2, engine: 1, seat: 1 });
  });

  it('vuelve a acelerar después de frenar y recoger', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    addCargoSupports(controller);
    controller.dispatch({ type: 'START_RIDE' });
    controller.dispatch({ type: 'SET_THROTTLE', value: 1 });
    for (let index = 0; index < 30; index += 1) controller.update(1 / 60);
    controller.dispatch({ type: 'SET_THROTTLE', value: 0 });
    controller.dispatch({ type: 'PAUSE' });
    controller.dispatch({ type: 'RESUME' });
    controller.dispatch({ type: 'RETRY' });
    controller.dispatch({ type: 'SET_THROTTLE', value: 1 });
    while (controller.snapshot.vehicleX < 5.8) controller.update(1 / 60);
    controller.dispatch({ type: 'SET_BRAKE', value: true });
    while (Math.abs(controller.snapshot.speedMps) > 0.05) controller.update(1 / 60);
    controller.dispatch({ type: 'COLLECT_REQUEST', requestId: 'primer-pasajero' });
    controller.dispatch({ type: 'SET_THROTTLE', value: 1 });
    for (let index = 0; index < 120; index += 1) controller.update(1 / 60);
    expect(controller.snapshot.speedMps).toBeGreaterThan(1);
    expect(controller.snapshot.vehicleX).toBeGreaterThan(7);
    expect(Math.abs(controller.worldSnapshot.body.angleRadians)).toBeLessThan(0.2);
    expect(controller.snapshot.engineHealthPercent).toBeGreaterThan(85);
  });

  it('detiene reloj y física al pausar', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    controller.dispatch({ type: 'START_RIDE' });
    controller.update(1 / 60);
    controller.dispatch({ type: 'PAUSE' });
    const before = controller.snapshot;
    for (let index = 0; index < 360; index += 1) controller.update(1 / 60);
    expect(controller.snapshot.ride?.remainingSeconds).toBe(before.ride?.remainingSeconds);
    expect(controller.snapshot.vehicleX).toBe(before.vehicleX);
    controller.dispatch({ type: 'RESUME' });
    controller.update(1 / 60);
    expect(controller.snapshot.ride?.remainingSeconds).toBeLessThan(before.ride?.remainingSeconds ?? 0);
  });

  it('equipa la suspensión comprada en el vehículo del recorrido', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    controller.dispatch({ type: 'BUY_PART', kind: 'suspension' });
    controller.dispatch({ type: 'PLACE_PART', kind: 'suspension', anchor: 'suspension' });
    controller.dispatch({ type: 'START_RIDE' });
    expect(controller.snapshot.state).toBe('PLAYING');
    expect(controller.worldSnapshot.body.wheels.every((wheel) =>
      wheel.suspension?.stiffnessNPerM === 24000)).toBe(true);
  });

  it('mantiene estable la simulación al recoger el scooter sin suspensión', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    addCargoSupports(controller);
    expect(gridForModel(controller.snapshot.game)
      .some((placement) => placement.kind === 'suspension')).toBe(false);
    controller.dispatch({ type: 'START_RIDE' });
    for (let index = 0; index < 90; index += 1) controller.update(1 / 60);
    expect(controller.worldSnapshot.joints.every((joint) => !joint.broken)).toBe(true);
    completeRide(controller);
    expect(controller.snapshot.message).not.toContain('simulación se detuvo');
    expect(controller.snapshot.state).toBe('RESULTS');
  });

  it('monta una parrilla como unión física con masa y umbral', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    controller.dispatch({ type: 'BUY_PART', kind: 'roofRack' });
    controller.dispatch({ type: 'PLACE_PART', kind: 'roofRack', anchor: 'roof' });
    controller.dispatch({ type: 'START_RIDE' });
    expect(controller.worldSnapshot.body.massKg).toBe(
      gridBuildStats(gridForModel(controller.snapshot.game)).massKg,
    );
    expect(controller.worldSnapshot.joints[0]).toMatchObject({ id: 'roofRack', broken: false });
  });

  it('completa la subida al cerro y desbloquea el nivel 3', () => {
    const storage = memoryStorage();
    new LocalSaveRepository(storage).save(createSaveData(modelWithPassenger(2), false));
    const controller = new AppController(new LocalSaveRepository(storage));
    controller.dispatch({ type: 'BOOT_COMPLETED' });
    controller.dispatch({ type: 'OPEN_LEVEL_SELECT' });
    controller.dispatch({ type: 'SELECT_LEVEL', levelId: 'subida-al-cerro' });
    assembleBaseVehicle(controller);
    addPassengerSeat(controller);
    controller.dispatch({ type: 'START_RIDE' });
    completeRide(controller);
    expect(controller.snapshot.state).toBe('RESULTS');
    expect(controller.snapshot.ride?.deliveredRevenue).toBeGreaterThanOrEqual(8);
    expect(controller.snapshot.won).toBe(true);
    expect(controller.snapshot.game.unlockedLevel).toBe(3);
  });

  it('completa el día de mercado con carga alta y desbloquea el nivel 4', () => {
    const storage = memoryStorage();
    new LocalSaveRepository(storage).save(createSaveData(fullyEquippedModel(3), false));
    const controller = new AppController(new LocalSaveRepository(storage));
    controller.dispatch({ type: 'BOOT_COMPLETED' });
    controller.dispatch({ type: 'OPEN_LEVEL_SELECT' });
    controller.dispatch({ type: 'SELECT_LEVEL', levelId: 'dia-de-mercado' });
    assembleBaseVehicle(controller);
    addCargoSupports(controller);
    controller.dispatch({ type: 'START_RIDE' });
    completeRide(controller);
    expect(controller.snapshot.state).toBe('RESULTS');
    expect(controller.snapshot.vehicleX).toBeGreaterThan(4);
    expect(controller.snapshot.ride?.deliveredRevenue).toBeGreaterThanOrEqual(9);
    expect(controller.snapshot.won).toBe(true);
    expect(controller.snapshot.game.unlockedLevel).toBe(4);
    expect(controller.snapshot.ride?.maximumPayloadMassKg).toBeGreaterThan(30);
  });

  it('supera la pista dañada con suspensión y desbloquea el nivel 5', () => {
    const storage = memoryStorage();
    new LocalSaveRepository(storage).save(createSaveData(fullyEquippedModel(4), false));
    const controller = new AppController(new LocalSaveRepository(storage));
    controller.dispatch({ type: 'BOOT_COMPLETED' });
    controller.dispatch({ type: 'OPEN_LEVEL_SELECT' });
    controller.dispatch({ type: 'SELECT_LEVEL', levelId: 'pista-danada' });
    assembleBaseVehicle(controller);
    addCargoSupports(controller, true);
    controller.dispatch({ type: 'START_RIDE' });
    completeRide(controller);
    expect(controller.snapshot.state).toBe('RESULTS');
    expect(controller.snapshot.ride?.deliveredRevenue).toBeGreaterThanOrEqual(10);
    expect(controller.snapshot.won).toBe(true);
    expect(controller.snapshot.game.unlockedLevel).toBe(5);
  });

  it('completa hora punta y registra el final de la campaña', () => {
    const storage = memoryStorage();
    new LocalSaveRepository(storage).save(createSaveData(fullyEquippedModel(5), false));
    const controller = new AppController(new LocalSaveRepository(storage));
    controller.dispatch({ type: 'BOOT_COMPLETED' });
    controller.dispatch({ type: 'OPEN_LEVEL_SELECT' });
    controller.dispatch({ type: 'SELECT_LEVEL', levelId: 'hora-punta' });
    assembleBaseVehicle(controller);
    addCargoSupports(controller, true);
    controller.dispatch({ type: 'START_RIDE' });
    completeRide(controller);
    expect(controller.snapshot.state).toBe('RESULTS');
    expect(controller.snapshot.ride?.deliveredRevenue).toBeGreaterThanOrEqual(11);
    expect(controller.snapshot.won).toBe(true);
    expect(controller.snapshot.game.unlockedLevel).toBe(5);
    expect(controller.snapshot.game.completedLevels['hora-punta']).toBeDefined();
  });

  it('permite salir sin una rueda, pero bloquea una construcción sin asiento', () => {
    const storage = memoryStorage();
    const controller = new AppController(new LocalSaveRepository(storage));
    enterWorkshop(controller);
    controller.dispatch({ type: 'REMOVE_PART', anchor: 'frontWheel' });
    controller.dispatch({ type: 'START_RIDE' });
    expect(controller.snapshot.state).toBe('PLAYING');

    const noSeat = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(noSeat);
    noSeat.dispatch({ type: 'REMOVE_PART', anchor: 'driverSeat' });
    noSeat.dispatch({ type: 'START_RIDE' });
    expect(noSeat.snapshot.state).toBe('WORKSHOP');
    expect(noSeat.snapshot.message).toBe('Falta el asiento del conductor.');

    storage.setItem('tunea-tu-combi:save:v1', '{mal-json');
    const recovered = new AppController(new LocalSaveRepository(storage));
    expect(recovered.snapshot.saveRecovered).toBe(true);
    expect(recovered.snapshot.game.wallet).toBe(100);
  });

  it('daña el motor al caer con la carrocería sobre la pista', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    const wheelIds = gridForModel(controller.snapshot.game)
      .filter((placement) => placement.kind === 'wheel')
      .map((placement) => placement.id);
    for (const placementId of wheelIds) {
      controller.dispatch({ type: 'REMOVE_GRID_PART', placementId });
    }
    controller.dispatch({ type: 'START_RIDE' });
    for (let index = 0; index < 360; index += 1) controller.update(1 / 60);
    expect(controller.snapshot.engineHealthPercent).toBeLessThanOrEqual(75);
  });

  it('muestra carga máxima y desgasta el motor al sostener el acelerador', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    controller.dispatch({ type: 'START_RIDE' });
    controller.dispatch({ type: 'SET_THROTTLE', value: 1 });
    for (let index = 0; index < 360; index += 1) controller.update(1 / 60);
    expect(controller.snapshot.engineLoadPercent).toBe(100);
    expect(controller.snapshot.engineHealthPercent).toBeLessThan(100);
  });

  it('arresta a la combi que retrocede fuera del primer recorrido', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    controller.dispatch({ type: 'START_RIDE' });
    controller.dispatch({ type: 'SET_THROTTLE', value: -1 });
    for (let index = 0; index < 600 && controller.snapshot.state === 'PLAYING'; index += 1) {
      controller.update(1 / 60);
    }
    expect(controller.snapshot.state).toBe('RESULTS');
    expect(controller.snapshot.won).toBe(false);
    expect(controller.snapshot.message).toContain('policía');
  });

  it('carga el perfil de demostración y conserva movimiento reducido', () => {
    const storage = memoryStorage();
    const controller = new AppController(new LocalSaveRepository(storage));
    controller.dispatch({ type: 'BOOT_COMPLETED' });
    controller.dispatch({ type: 'LOAD_DEMO_PROFILE' });
    controller.dispatch({ type: 'TOGGLE_REDUCED_MOTION' });
    expect(controller.snapshot.game.unlockedLevel).toBe(5);
    expect(controller.snapshot.game.workshopBuild.suspension).toBe('suspension');
    expect(controller.snapshot.reducedMotion).toBe(true);
    const reloaded = new AppController(new LocalSaveRepository(storage));
    expect(reloaded.snapshot.game.unlockedLevel).toBe(5);
    expect(reloaded.snapshot.reducedMotion).toBe(true);
  });

  it('reinicia un intento activo sin consumir progreso', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    controller.dispatch({ type: 'START_RIDE' });
    controller.dispatch({ type: 'SET_THROTTLE', value: 1 });
    for (let index = 0; index < 120; index += 1) controller.update(1 / 60);
    expect(controller.snapshot.ride?.remainingSeconds).toBeLessThan(60);
    controller.dispatch({ type: 'RESTART_RIDE' });
    expect(controller.snapshot.state).toBe('PLAYING');
    expect(controller.snapshot.ride?.remainingSeconds).toBe(60);
    expect(controller.snapshot.vehicleX).toBe(2);
  });
});
