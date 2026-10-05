export const APP_STATES = [
  'BOOT',
  'MENU',
  'LEVEL_SELECT',
  'WORKSHOP',
  'PLAYING',
  'PAUSED',
  'RESULTS',
] as const;

export type AppState = (typeof APP_STATES)[number];

const ALLOWED_TRANSITIONS: Readonly<Record<AppState, readonly AppState[]>> = {
  BOOT: ['MENU'],
  MENU: ['LEVEL_SELECT'],
  LEVEL_SELECT: ['MENU', 'WORKSHOP'],
  WORKSHOP: ['LEVEL_SELECT'],
  PLAYING: ['PAUSED', 'RESULTS'],
  PAUSED: ['PLAYING', 'RESULTS'],
  RESULTS: ['WORKSHOP', 'LEVEL_SELECT'],
};

export class AppStateMachine {
  #state: AppState;
  readonly #listeners = new Set<(state: AppState) => void>();

  constructor(initialState: AppState = 'BOOT') {
    this.#state = initialState;
  }

  get state(): AppState {
    return this.#state;
  }

  canTransition(nextState: AppState): boolean {
    return ALLOWED_TRANSITIONS[this.#state].includes(nextState);
  }

  transition(nextState: AppState): void {
    if (!this.canTransition(nextState)) {
      throw new Error(`Transición inválida: ${this.#state} -> ${nextState}`);
    }

    this.#state = nextState;
    for (const listener of this.#listeners) listener(this.#state);
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }
}
