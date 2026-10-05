import { describe, expect, it } from 'vitest';
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
    expect(requests.filter((request) => request.kind === 'passenger')).toHaveLength(2);
    expect(requests.some((request) => request.kind !== 'passenger')).toBe(true);
    for (const request of requests) {
      expect(request.massKg).toBeGreaterThan(0);
      expect(request.requiredCapacity).toBeGreaterThan(0);
      expect(requestFare(request)).toBeGreaterThan(0);
    }
  });

  it('rechaza semillas vacías', () => {
    expect(() => generateLevelOneRequests('  ')).toThrow('semilla');
  });

  it('genera retos distintos para cerro y mercado', () => {
    const hill = generateRequests('subida-al-cerro', 'cerro-base');
    const market = generateRequests('dia-de-mercado', 'mercado-base');
    expect(hill.every((request) => request.kind === 'passenger')).toBe(true);
    expect(market.map((request) => request.kind)).toEqual(['passenger', 'roofCargo', 'scooter']);
    expect(hill.reduce((total, request) => total + requestFare(request), 0)).toBeGreaterThanOrEqual(40);
    expect(market.reduce((total, request) => total + requestFare(request), 0)).toBeGreaterThanOrEqual(55);
  });
});
