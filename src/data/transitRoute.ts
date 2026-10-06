export interface TransitStop {
  readonly name: string;
  readonly progress: number;
}

export interface TransitRoute {
  readonly code: string;
  readonly direction: string;
  readonly stops: readonly TransitStop[];
}

// Tramo resumido de la ruta limeña CR27, adaptado a recorridos de 30 segundos.
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
    { name: 'Canta Callao', progress: 1 },
  ],
};
