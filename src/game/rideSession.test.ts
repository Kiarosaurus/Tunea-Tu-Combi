import { describe, expect, it } from 'vitest';
import { LEVELS } from '../data/levels';
import { createInitialGameModel } from './model';
import { generateRequests, requestFare } from './requests';
import { applyRideResult, RideSession, RIDE_DURATION_SECONDS } from './rideSession';

describe('primer recorrido', () => {
  const oneSeat = { passenger: 1, roofCargo: 0, scooter: 0 } as const;
  const allCapacity = { passenger: 1, roofCargo: 1, scooter: 1 } as const;
  const noCapacity = { passenger: 0, roofCargo: 0, scooter: 0 } as const;

  it('solo recoge con asiento y acredita al entregar en destino', () => {
    const ride = new RideSession();
    const request = ride.snapshot.requests.find((item) =>
      item.request.id === 'primer-pasajero')?.request;
    expect(request).toBeDefined();
    if (!request) return;
    expect(() => ride.collect('primer-pasajero', 8, 0, noCapacity)).toThrow('Falta un asiento');
    ride.collect('primer-pasajero', 8, 0, oneSeat);
    expect(ride.snapshot.maximumPayloadMassKg).toBeGreaterThan(0);
    expect(ride.snapshot.deliveredRevenue).toBe(0);
    expect(() => ride.deliver(10)).toThrow('destino');
    expect(ride.deliver(request.destinationX)).toBe(requestFare(request));
    expect(ride.snapshot.deliveredRevenue).toBe(requestFare(request));
  });

  it('obliga a detener la combi antes de recoger', () => {
    const ride = new RideSession();
    expect(() => ride.collect('primer-pasajero', 8, 1.2, oneSeat)).toThrow('Frena por completo');
    expect(ride.snapshot.requests[0]?.status).toBe('waiting');
  });

  it('exige el soporte que corresponde a una carga', () => {
    const ride = new RideSession();
    const cargo = ride.snapshot.requests.find((item) => item.request.kind !== 'passenger')?.request;
    expect(cargo).toBeDefined();
    if (!cargo) return;
    expect(() => ride.collect(cargo.id, cargo.originX, 0, noCapacity)).toThrow('Falta');
    const capacity = { ...noCapacity, passenger: 1, [cargo.kind]: 1 };
    ride.collect(cargo.id, cargo.originX, 0, capacity);
    expect(ride.snapshot.requests.find((item) => item.request.id === cargo.id)?.status).toBe('onboard');
    expect(ride.snapshot.maximumPayloadMassKg).toBe(cargo.massKg);
    expect(ride.lose(cargo.id)).toBe(true);
    expect(ride.snapshot.requests.find((item) => item.request.id === cargo.id)?.status).toBe('missed');
    expect(ride.lose(cargo.id)).toBe(false);
  });

  it('reserva un asiento para la persona que acompaña cada carga', () => {
    const ride = new RideSession();
    const cargo = ride.snapshot.requests.find((item) => item.request.kind !== 'passenger')?.request;
    expect(cargo).toBeDefined();
    if (!cargo) return;
    const onlySupport = { ...noCapacity, [cargo.kind]: 1 };
    expect(() => ride.collect(cargo.id, cargo.originX, 0, onlySupport)).toThrow('acompaña la carga');
  });

  it('mantiene tiempo fijo y termina a los 60 segundos', () => {
    const ride = new RideSession();
    for (let index = 0; index < 120; index += 1) ride.advance(0.5, 0);
    expect(ride.snapshot.remainingSeconds).toBe(0);
    expect(ride.snapshot.finished).toBe(true);
    expect(RIDE_DURATION_SECONDS).toBe(60);
  });

  it('resume estabilidad y piezas perdidas del intento', () => {
    const ride = new RideSession();
    ride.advance(1, 2, 0.4, 1);
    expect(ride.snapshot.stabilityPercent).toBe(64);
    expect(ride.snapshot.lostPieces).toBe(1);
  });

  it('gana tres estrellas con todas las entregas y desbloquea nivel 2', () => {
    const ride = new RideSession();
    for (const requestId of ['primer-pasajero', 'segundo-pasajero', 'tercer-pasajero']) {
      const request = ride.snapshot.requests.find((item) => item.request.id === requestId)?.request;
      expect(request).toBeDefined();
      if (!request) return;
      ride.collect(request.id, request.originX, 0, allCapacity);
      ride.deliver(request.destinationX);
    }
    ride.advance(60, 96);
    const initial = createInitialGameModel();
    const result = applyRideResult(initial, ride.snapshot, 'primer-recorrido');
    expect(result.won).toBe(true);
    expect(result.stars).toBe(3);
    expect(result.model.wallet).toBe(100);
    expect(result.model.unlockedLevel).toBe(2);
    expect(result.model.completedLevels['primer-recorrido']?.bestDelivered).toBe(3);
    expect(result.model.completedLevels['primer-recorrido']?.bestStars).toBe(3);
  });

  it('baja automáticamente al pasajero y libera el asiento en su destino', () => {
    const ride = new RideSession();
    const request = ride.snapshot.requests.find((item) =>
      item.request.id === 'primer-pasajero')?.request;
    expect(request).toBeDefined();
    if (!request) return;
    ride.collect('primer-pasajero', 8, 0, oneSeat);
    expect(ride.deliverArrived(8)).toEqual([]);
    expect(ride.deliverArrived(request.destinationX)).toEqual([
      {
        requestId: 'primer-pasajero',
        fare: requestFare(request),
        destinationStop: request.destinationStop,
        servedByRoute: true,
      },
    ]);
    expect(ride.snapshot.requests.find((item) => item.request.id === 'primer-pasajero')?.status)
      .toBe('delivered');
    expect(() => ride.collect('segundo-pasajero', 31, 0, oneSeat)).not.toThrow();
  });

  it('no baja pasajeros ni cargas antes de su destino en ninguna ruta', () => {
    for (const level of LEVELS) {
      const requests = generateRequests(level.id, level.seed);
      for (const request of requests) {
        const ride = new RideSession(level.seed, [request], level.durationSeconds, level.finishX);
        ride.collect(request.id, request.originX, 0, allCapacity);
        expect(ride.deliverArrived(request.destinationX - 0.01),
          `${level.id}/${request.id} se entregó antes del destino`).toEqual([]);
        expect(ride.deliverArrived(request.destinationX),
          `${level.id}/${request.id} no se entregó al llegar`).toEqual([
          {
            requestId: request.id,
            fare: requestFare(request),
            destinationStop: request.destinationStop,
            servedByRoute: request.servedByRoute,
          },
        ]);
      }
    }
  });

  it('libera sin pago al pasajero cuyo destino no pertenece a la ruta', () => {
    const ride = new RideSession();
    const request = ride.snapshot.requests.find((item) => !item.request.servedByRoute)?.request;
    expect(request).toBeDefined();
    if (!request) return;
    ride.collect(request.id, request.originX, 0, oneSeat);
    expect(ride.deliverArrived(request.destinationX)).toEqual([{
      requestId: request.id,
      fare: 0,
      destinationStop: 'Gamarra',
      servedByRoute: false,
    }]);
    expect(ride.snapshot.deliveredRevenue).toBe(0);
    expect(ride.snapshot.deliveredCount).toBe(0);
  });

  it('fallar no acredita ingreso provisional ni desbloquea', () => {
    const ride = new RideSession();
    const request = ride.snapshot.requests.find((item) =>
      item.request.id === 'primer-pasajero')?.request;
    expect(request).toBeDefined();
    if (!request) return;
    ride.collect('primer-pasajero', 8, 0, oneSeat);
    ride.deliver(request.destinationX);
    ride.advance(60, request.destinationX);
    const result = applyRideResult(createInitialGameModel(), ride.snapshot, 'primer-recorrido');
    expect(result.won).toBe(false);
    expect(result.model.wallet).toBe(100);
    expect(result.model.unlockedLevel).toBe(1);
  });
});
