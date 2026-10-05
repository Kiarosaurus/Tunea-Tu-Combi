import { describe, expect, it } from 'vitest';
import { LocalSaveRepository, type StorageLike } from '../persistence/saveRepository';
import { AppController } from './appController';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function enterWorkshop(controller: AppController): void {
  controller.dispatch({ type: 'BOOT_COMPLETED' });
  controller.dispatch({ type: 'OPEN_LEVEL_SELECT' });
  controller.dispatch({ type: 'SELECT_LEVEL', levelId: 'primer-recorrido' });
}

describe('flujo vertical del primer recorrido', () => {
  it('compra, completa la cuota, desbloquea nivel 2 y persiste tras recargar', () => {
    const storage = memoryStorage();
    const controller = new AppController(new LocalSaveRepository(storage));
    enterWorkshop(controller);
    controller.dispatch({ type: 'BUY_PART', kind: 'seat' });
    controller.dispatch({ type: 'PLACE_PART', kind: 'seat', anchor: 'passengerSeat' });
    controller.dispatch({ type: 'START_RIDE' });
    expect(controller.snapshot.state).toBe('PLAYING');
    controller.dispatch({ type: 'SET_THROTTLE', value: 1 });
    let maximumObservedPayloadKg = 0;

    for (let index = 0; index < 1800 && controller.snapshot.state === 'PLAYING'; index += 1) {
      controller.update(1 / 60);
      maximumObservedPayloadKg = Math.max(maximumObservedPayloadKg,
        controller.worldSnapshot.payloadMassKg);
      const snapshot = controller.snapshot;
      for (const progress of snapshot.ride?.requests ?? []) {
        if (progress.status === 'waiting' &&
          Math.abs(snapshot.vehicleX - progress.request.originX) < 1.2) {
          controller.dispatch({ type: 'COLLECT_REQUEST', requestId: progress.request.id });
        }
        if (progress.status === 'onboard' &&
          Math.abs(snapshot.vehicleX - progress.request.destinationX) < 1.2) {
          controller.dispatch({ type: 'DELIVER_REQUEST' });
        }
      }
    }

    expect(controller.snapshot.state).toBe('RESULTS');
    expect(controller.snapshot.won).toBe(true);
    expect(controller.snapshot.ride?.deliveredRevenue).toBeGreaterThanOrEqual(25);
    expect(controller.snapshot.game.unlockedLevel).toBe(2);
    expect(maximumObservedPayloadKg).toBeGreaterThan(0);
    expect(controller.snapshot.ride?.maximumPayloadMassKg).toBe(maximumObservedPayloadKg);

    const reloaded = new AppController(new LocalSaveRepository(storage));
    expect(reloaded.snapshot.game.wallet).toBe(controller.snapshot.game.wallet);
    expect(reloaded.snapshot.game.unlockedLevel).toBe(2);
    expect(reloaded.snapshot.game.workshopBuild.passengerSeat).toBe('seat');
  });

  it('detiene reloj y física al pausar', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    controller.dispatch({ type: 'START_RIDE' });
    controller.update(1 / 60);
    controller.dispatch({ type: 'PAUSE' });
    const before = controller.snapshot;
    for (let index = 0; index < 180; index += 1) controller.update(1 / 60);
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

  it('monta una parrilla como unión física con masa y umbral', () => {
    const controller = new AppController(new LocalSaveRepository(memoryStorage()));
    enterWorkshop(controller);
    controller.dispatch({ type: 'BUY_PART', kind: 'roofRack' });
    controller.dispatch({ type: 'PLACE_PART', kind: 'roofRack', anchor: 'roof' });
    controller.dispatch({ type: 'START_RIDE' });
    expect(controller.worldSnapshot.body.massKg).toBe(728);
    expect(controller.worldSnapshot.joints[0]).toMatchObject({ id: 'roofRack', broken: false });
  });

  it('bloquea una construcción sin rueda y recupera un guardado inválido', () => {
    const storage = memoryStorage();
    const controller = new AppController(new LocalSaveRepository(storage));
    enterWorkshop(controller);
    controller.dispatch({ type: 'REMOVE_PART', anchor: 'frontWheel' });
    controller.dispatch({ type: 'START_RIDE' });
    expect(controller.snapshot.state).toBe('WORKSHOP');
    expect(controller.snapshot.message).toBe('Faltan dos ruedas.');

    storage.setItem('tunea-tu-combi:save:v1', '{mal-json');
    const recovered = new AppController(new LocalSaveRepository(storage));
    expect(recovered.snapshot.saveRecovered).toBe(true);
    expect(recovered.snapshot.game.wallet).toBe(100);
  });
});
