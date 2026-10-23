import type { RoadObstacle } from '../data/levels';

export function obstacleImpactImpulse(obstacle: RoadObstacle, speedMps: number): number {
  const excess = Math.max(0, Math.abs(speedMps) - obstacle.safeSpeedMps);
  return obstacle.impactImpulseNs * Math.min(1, excess / 3.8);
}
