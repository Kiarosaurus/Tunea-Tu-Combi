export const ENGINE_LOAD_GAIN_PER_SECOND = 0.2;
export const ENGINE_LOAD_COOLING_PER_SECOND = 1.2;
export const ENGINE_OVERLOAD_DAMAGE_PER_SECOND = 0.05;

export interface EngineLoadResult {
  readonly load: number;
  readonly damage: number;
  readonly overloaded: boolean;
}

export function updateEngineLoad(currentLoad: number, demanding: boolean,
  durationSeconds: number): EngineLoadResult {
  if (![currentLoad, durationSeconds].every(Number.isFinite) ||
    currentLoad < 0 || currentLoad > 1 || durationSeconds < 0) {
    throw new Error('La carga del motor requiere valores válidos.');
  }
  if (!demanding) {
    return {
      load: Math.max(0, currentLoad - ENGINE_LOAD_COOLING_PER_SECOND * durationSeconds),
      damage: 0,
      overloaded: false,
    };
  }
  const timeToMaximum = (1 - currentLoad) / ENGINE_LOAD_GAIN_PER_SECOND;
  const timeAtMaximum = Math.max(0, durationSeconds - timeToMaximum);
  return {
    load: Math.min(1, currentLoad + ENGINE_LOAD_GAIN_PER_SECOND * durationSeconds),
    damage: timeAtMaximum * ENGINE_OVERLOAD_DAMAGE_PER_SECOND,
    overloaded: timeAtMaximum > 0 || currentLoad === 1,
  };
}
