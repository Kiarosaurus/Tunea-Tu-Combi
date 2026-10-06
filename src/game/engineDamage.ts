export const IMPACT_DAMAGE_FRACTION = 0.25;
export const DRAG_DAMAGE_PER_SECOND = 0.08;
export const IMPACT_THRESHOLD_NS = 220;
export const DRAG_SPEED_THRESHOLD_MPS = 0.55;

export interface EngineDamageInput {
  readonly health: number;
  readonly durationSeconds: number;
  readonly chassisContact: boolean;
  readonly contactStarted: boolean;
  readonly maximumNormalImpulseNs: number;
  readonly speedMps: number;
}

export interface EngineDamageResult {
  readonly health: number;
  readonly impactApplied: boolean;
  readonly dragging: boolean;
}

export function calculateEngineDamage(input: EngineDamageInput): EngineDamageResult {
  if (![input.health, input.durationSeconds, input.maximumNormalImpulseNs, input.speedMps]
    .every(Number.isFinite) || input.durationSeconds < 0) {
    throw new Error('El daño del motor requiere valores finitos.');
  }
  const impactApplied = input.chassisContact && input.contactStarted &&
    input.maximumNormalImpulseNs >= IMPACT_THRESHOLD_NS;
  const dragging = input.chassisContact && Math.abs(input.speedMps) >= DRAG_SPEED_THRESHOLD_MPS;
  const damage = (impactApplied ? IMPACT_DAMAGE_FRACTION : 0) +
    (dragging ? DRAG_DAMAGE_PER_SECOND * input.durationSeconds : 0);
  return {
    health: Math.max(0, Math.min(1, input.health - damage)),
    impactApplied,
    dragging,
  };
}
