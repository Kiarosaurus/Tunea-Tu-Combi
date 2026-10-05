import { describe, expect, it } from 'vitest';
import { createInitialGameModel } from './model';
import { applyRideResult, RideSession, RIDE_DURATION_SECONDS } from './rideSession';

describe('primer recorrido', () => {
  const oneSeat = { passenger: 1, roofCargo: 0, scooter: 0 } as const;
  const noCapacity = { passenger: 0, roofCargo: 0, scooter: 0 } as const;

  it('solo recoge con asiento y acredita al entregar en destino', () => {
    const ride = new RideSession();
    expect(() => ride.collect('primer-pasajero', 5, noCapacity)).toThrow('Falta un asiento');
    ride.collect('primer-pasajero', 5, oneSeat);
    expect(ride.snapshot.maximumPayloadMassKg).toBeGreaterThan(0);
    expect(ride.snapshot.deliveredRevenue).toBe(0);
    expect(() => ride.deliver(6)).toThrow('destino');
    expect(ride.deliver(12)).toBe(15);
    expect(ride.snapshot.deliveredRevenue).toBe(15);
  });

  it('exige el soporte que corresponde a una carga', () => {
    const ride = new RideSession();
    const cargo = ride.snapshot.requests.find((item) => item.request.kind !== 'passenger')?.request;
    expect(cargo).toBeDefined();
    if (!cargo) return;
    expect(() => ride.collect(cargo.id, cargo.originX, noCapacity)).toThrow('Falta');
    const capacity = { ...noCapacity, [cargo.kind]: 1 };
    ride.collect(cargo.id, cargo.originX, capacity);
    expect(ride.snapshot.requests.find((item) => item.request.id === cargo.id)?.status).toBe('onboard');
    expect(ride.snapshot.maximumPayloadMassKg).toBe(cargo.massKg);
    expect(ride.lose(cargo.id)).toBe(true);
    expect(ride.snapshot.requests.find((item) => item.request.id === cargo.id)?.status).toBe('missed');
    expect(ride.lose(cargo.id)).toBe(false);
  });

  it('mantiene tiempo fijo y termina a los 30 segundos', () => {
    const ride = new RideSession();
    for (let index = 0; index < 60; index += 1) ride.advance(0.5, 0);
    expect(ride.snapshot.remainingSeconds).toBe(0);
    expect(ride.snapshot.finished).toBe(true);
    expect(RIDE_DURATION_SECONDS).toBe(30);
  });

  it('gana con dos entregas y desbloquea nivel 2', () => {
    const ride = new RideSession();
    ride.collect('primer-pasajero', 5, oneSeat);
    ride.deliver(12);
    ride.collect('segundo-pasajero', 15, oneSeat);
    ride.deliver(22);
    ride.advance(30, 22);
    const initial = createInitialGameModel();
    const result = applyRideResult(initial, ride.snapshot, 'primer-recorrido');
    expect(result.won).toBe(true);
    expect(result.model.wallet).toBe(130);
    expect(result.model.unlockedLevel).toBe(2);
    expect(result.model.completedLevels['primer-recorrido']?.bestDelivered).toBe(2);
  });

  it('fallar no acredita ingreso provisional ni desbloquea', () => {
    const ride = new RideSession();
    ride.collect('primer-pasajero', 5, oneSeat);
    ride.deliver(12);
    ride.advance(30, 12);
    const result = applyRideResult(createInitialGameModel(), ride.snapshot, 'primer-recorrido');
    expect(result.won).toBe(false);
    expect(result.model.wallet).toBe(100);
    expect(result.model.unlockedLevel).toBe(1);
  });
});
