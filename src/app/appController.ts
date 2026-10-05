import { LEVELS } from '../data/levels';
import { AppStateMachine, type AppState } from './appState';

export type AppAction =
  | { readonly type: 'BOOT_COMPLETED' }
  | { readonly type: 'OPEN_LEVEL_SELECT' }
  | { readonly type: 'SELECT_LEVEL'; readonly levelId: string }
  | { readonly type: 'TOGGLE_DEBUG' }
  | { readonly type: 'BACK' };

export interface AppSnapshot {
  readonly state: AppState;
  readonly selectedLevelId: string | null;
  readonly debugEnabled: boolean;
}

export class AppController {
  readonly #machine = new AppStateMachine();
  readonly #listeners = new Set<(snapshot: AppSnapshot) => void>();
  #selectedLevelId: string | null = null;
  #debugEnabled = false;

  constructor() {
    this.#machine.subscribe(() => this.#notify());
  }

  get snapshot(): AppSnapshot {
    return {
      state: this.#machine.state,
      selectedLevelId: this.#selectedLevelId,
      debugEnabled: this.#debugEnabled,
    };
  }

  dispatch(action: AppAction): void {
    switch (action.type) {
      case 'BOOT_COMPLETED':
        this.#machine.transition('MENU');
        return;
      case 'OPEN_LEVEL_SELECT':
        this.#machine.transition('LEVEL_SELECT');
        return;
      case 'SELECT_LEVEL':
        if (!LEVELS.some((level) => level.id === action.levelId)) {
          throw new Error(`Nivel desconocido: ${action.levelId}`);
        }
        this.#selectedLevelId = action.levelId;
        this.#machine.transition('WORKSHOP');
        return;
      case 'TOGGLE_DEBUG':
        this.#debugEnabled = !this.#debugEnabled;
        this.#notify();
        return;
      case 'BACK':
        this.#goBack();
        return;
    }
  }

  subscribe(listener: (snapshot: AppSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }

  #goBack(): void {
    if (this.#machine.state === 'LEVEL_SELECT') {
      this.#machine.transition('MENU');
      return;
    }
    if (this.#machine.state === 'WORKSHOP') {
      this.#machine.transition('LEVEL_SELECT');
      return;
    }
    throw new Error(`No se puede volver desde ${this.#machine.state}`);
  }

  #notify(): void {
    for (const listener of this.#listeners) listener(this.snapshot);
  }
}
