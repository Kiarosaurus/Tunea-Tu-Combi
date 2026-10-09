import { describe, expect, it } from 'vitest';
import { LEVELS } from '../data/levels';
import { generateLevelOneRequests, generateRequests, requestFare } from './requests';

describe('generación de solicitudes', () => {
  it('repite exactamente la secuencia para una misma semilla', () => {
    expect(generateLevelOneRequests('lima-01')).toEqual(generateLevelOneRequests('lima-01'));
  });

  it('cambia atributos variables con otra semilla sin alterar la ruta base', () => {
    const first = generateLevelOneRequests('lima-01');
    const second = generateLevelOneRequests('lima-02');
    expect(second).not.toEqual(first);
    expect(second.map((request) => [request.originX, request.destinationX])).toEqual(
      first.map((request) => [request.originX, request.destinationX]),
    );
  });

  it('incluye pasajeros y una carga con masa, capacidad y tarifa positivas', () => {
    const requests = generateLevelOneRequests('primer-recorrido-base');
    expect(requests.filter((request) => request.kind === 'passenger')).toHaveLength(4);
    expect(requests).toHaveLength(6);
    expect(requests.some((request) => request.kind !== 'passenger')).toBe(true);
    for (const request of requests) {
      expect(request.massKg).toBeGreaterThan(0);
      expect(request.requiredCapacity).toBeGreaterThan(0);
      expect(requestFare(request)).toBeGreaterThanOrEqual(1);
      expect(requestFare(request)).toBeLessThanOrEqual(5);
      expect(request.attendantVariant).toBeTruthy();
      if (request.kind !== 'passenger') {
        expect(request.cargoMassKg).toBeGreaterThan(0);
        expect(request.massKg).toBeGreaterThan(request.cargoMassKg);
      }
    }
  });

  it('rechaza semillas vacías', () => {
    expect(() => generateLevelOneRequests('  ')).toThrow('semilla');
  });

  it('genera retos distintos para cerro y mercado', () => {
    const hill = generateRequests('subida-al-cerro', 'cerro-base');
    const market = generateRequests('dia-de-mercado', 'mercado-base');
    expect(hill.every((request) => request.kind === 'passenger')).toBe(true);
    expect(new Set(market.map((request) => request.kind))).toEqual(
      new Set(['passenger', 'roofCargo', 'scooter']),
    );
    expect(hill.reduce((total, request) => total + requestFare(request), 0))
      .toBeGreaterThanOrEqual(LEVELS[1]?.quota ?? Number.POSITIVE_INFINITY);
    expect(market.reduce((total, request) => total + requestFare(request), 0))
      .toBeGreaterThanOrEqual(LEVELS[2]?.quota ?? Number.POSITIVE_INFINITY);
  });

  it('ofrece más ingresos que los necesarios para tres estrellas', () => {
    for (const level of LEVELS) {
      const totalAvailable = generateRequests(level.id, level.seed)
        .reduce((total, request) => total + requestFare(request), 0);
      expect(totalAvailable).toBeGreaterThan(level.starGoals[2]);
      expect(level.finishX / level.maxSpeedMps).toBeGreaterThan(20);
      expect(level.durationSeconds).toBe(60);
    }
  });

  it('cubre las cuotas de pista dañada y hora punta con todos los soportes', () => {
    const damaged = generateRequests('pista-danada', 'pista-danada-base');
    const rush = generateRequests('hora-punta', 'hora-punta-base');
    expect(damaged.reduce((total, request) => total + requestFare(request), 0))
      .toBeGreaterThanOrEqual(LEVELS[3]?.quota ?? Number.POSITIVE_INFINITY);
    expect(rush.reduce((total, request) => total + requestFare(request), 0))
      .toBeGreaterThanOrEqual(LEVELS[4]?.quota ?? Number.POSITIVE_INFINITY);
    expect(new Set(rush.map((request) => request.kind))).toEqual(
      new Set(['passenger', 'roofCargo', 'scooter']),
    );
  });
});
