import { describe, expect, it } from 'vitest';
import { dropoffXForStop, routeSegmentForStop, TRANSIT_ROUTE } from './transitRoute';

describe('geometría de la ruta CR27', () => {
  it('mantiene paraderos ordenados e incluye todos los extremos de bajada', () => {
    expect(TRANSIT_ROUTE.stops.map((stop) => stop.name)).toEqual([
      'Collique', 'Próceres', 'Vista Alegre', 'Hospital Collique',
      'Universitaria', 'Trapiche', 'Canta Callao', 'Naranjal',
    ]);
    for (let index = 1; index < TRANSIT_ROUTE.stops.length; index += 1) {
      expect(TRANSIT_ROUTE.stops[index]?.progress)
        .toBeGreaterThan(TRANSIT_ROUTE.stops[index - 1]?.progress ?? -1);
    }
  });

  it('genera la bajada después del paradero y antes del siguiente', () => {
    const segment = routeSegmentForStop('Hospital Collique', 100);
    expect(segment).toEqual({ startX: 52, endX: 69 });
    expect(dropoffXForStop('Hospital Collique', 100, 0)).toBeGreaterThan(segment.startX);
    expect(dropoffXForStop('Hospital Collique', 100, 0.999)).toBeLessThan(segment.endX);
  });

  it('usa el final de la ruta para el último paradero', () => {
    expect(routeSegmentForStop('Naranjal', 120)).toEqual({ startX: 120, endX: 120 });
    expect(dropoffXForStop('Naranjal', 120, 0.4)).toBe(120);
  });
});
