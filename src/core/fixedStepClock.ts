export const FIXED_STEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.25;
const MAX_STEPS_PER_FRAME = 15;

export class FixedStepClock {
  #accumulator = 0;

  advance(elapsedSeconds: number, step: (durationSeconds: number) => void): number {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
      throw new Error('El tiempo transcurrido debe ser finito y no negativo.');
    }

    this.#accumulator += Math.min(elapsedSeconds, MAX_FRAME_SECONDS);
    let steps = 0;
    while (this.#accumulator + 1e-12 >= FIXED_STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      step(FIXED_STEP_SECONDS);
      this.#accumulator -= FIXED_STEP_SECONDS;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.#accumulator = 0;
    return steps;
  }

  reset(): void {
    this.#accumulator = 0;
  }
}
