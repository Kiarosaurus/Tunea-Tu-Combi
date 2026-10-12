export interface TransitStop {
  readonly name: string;
  readonly progress: number;
}

export interface TransitRoute {
  readonly code: string;
  readonly direction: string;
  readonly stops: readonly TransitStop[];
}

// Tramo resumido de la ruta limeña CR27, adaptado a intentos de 60 segundos.
export const TRANSIT_ROUTE: TransitRoute = {
  code: 'CR27',
  direction: 'Comas - S.M.P.',
  stops: [
    { name: 'Collique', progress: 0 },
    { name: 'Próceres', progress: 0.18 },
    { name: 'Vista Alegre', progress: 0.35 },
    { name: 'Hospital Collique', progress: 0.52 },
    { name: 'Universitaria', progress: 0.69 },
    { name: 'Trapiche', progress: 0.84 },
    { name: 'Canta Callao', progress: 0.92 },
    { name: 'Naranjal', progress: 1 },
  ],
};

export interface RouteSegment {
  readonly startX: number;
  readonly endX: number;
}

export function routeSegmentForStop(stopName: string, finishX: number): RouteSegment {
  if (!Number.isFinite(finishX) || finishX <= 0) throw new Error('La ruta requiere una longitud positiva.');
  const index = TRANSIT_ROUTE.stops.findIndex((stop) => stop.name === stopName);
  if (index < 0) throw new Error(`El paradero ${stopName} no existe en la ruta.`);
  const stop = TRANSIT_ROUTE.stops[index];
  if (!stop) throw new Error(`El paradero ${stopName} no existe en la ruta.`);
  const next = TRANSIT_ROUTE.stops[index + 1];
  return {
    startX: stop.progress * finishX,
    endX: (next?.progress ?? stop.progress) * finishX,
  };
}

export function dropoffXForStop(stopName: string, finishX: number, randomValue: number): number {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new Error('El punto aleatorio de bajada debe estar entre cero y uno.');
  }
  const segment = routeSegmentForStop(stopName, finishX);
  if (segment.startX === segment.endX) return segment.startX;
  const progressInsideSegment = 0.12 + randomValue * 0.76;
  return segment.startX + (segment.endX - segment.startX) * progressInsideSegment;
}
