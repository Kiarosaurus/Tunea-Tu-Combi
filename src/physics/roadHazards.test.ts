import { describe, expect, it } from 'vitest';
import { LEVELS } from '../data/levels';
import { obstacleImpactImpulse } from './roadHazards';

describe('riesgo de obstáculos', () => {
  it('conserva uniones al frenar y aumenta el impulso al cruzar rápido', () => {
    for (const level of LEVELS) {
      for (const obstacle of level.obstacles) {
        expect(obstacleImpactImpulse(obstacle, obstacle.safeSpeedMps)).toBe(0);
        expect(obstacleImpactImpulse(obstacle, -obstacle.safeSpeedMps)).toBe(0);
        expect(obstacleImpactImpulse(obstacle, level.maxSpeedMps))
          .toBeGreaterThan(obstacleImpactImpulse(obstacle, obstacle.safeSpeedMps + 0.5));
      }
    }
  });
});
