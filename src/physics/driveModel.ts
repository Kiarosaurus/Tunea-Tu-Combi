import type { WorldSnapshot } from './world';

export interface DriveParameters {
  readonly maxEngineForceN: number;
  readonly maxSpeedMps: number;
  readonly brakingForceN: number;
  readonly rollingResistanceNPerMps: number;
  readonly tractionCoefficient: number;
}

export interface DriveInput {
  readonly throttle: -1 | 0 | 1;
  readonly braking: boolean;
}

export const URBAN_ENGINE: DriveParameters = {
  maxEngineForceN: 2200,
  maxSpeedMps: 5.5,
  brakingForceN: 3000,
  rollingResistanceNPerMps: 125,
  tractionCoefficient: 0.72,
};

export function driveForceN(
  world: WorldSnapshot,
  input: DriveInput,
  parameters: DriveParameters = URBAN_ENGINE,
): number {
  const speed = world.body.velocity.x;
  const resistance = speed === 0 ? 0 : -speed * parameters.rollingResistanceNPerMps;
  if (world.contacts.length === 0 && world.suspensionForces.length === 0) return resistance;

  const desiredEngineForce = Math.abs(speed) >= parameters.maxSpeedMps &&
    Math.sign(speed) === input.throttle
    ? 0
    : input.throttle * parameters.maxEngineForceN;
  const desiredBrakeForce = input.braking && Math.abs(speed) > 0.02
    ? -Math.sign(speed) * parameters.brakingForceN
    : 0;
  const contactSupportN = world.contacts.length > 0
    ? world.body.massKg * Math.abs(world.gravity.y) *
      Math.max(...world.contacts.map((contact) => contact.normal.y))
    : 0;
  const suspensionSupportN = world.suspensionForces.reduce((total, spring) =>
    total + spring.forceN, 0);
  const tractionLimit = parameters.tractionCoefficient *
    Math.max(contactSupportN, suspensionSupportN);
  const wheelForce = Math.max(-tractionLimit, Math.min(tractionLimit,
    desiredEngineForce + desiredBrakeForce));
  return wheelForce + resistance;
}
