export const INITIAL_WALLET = 100;

export interface GameModel {
  readonly wallet: number;
  readonly unlockedLevel: number;
}

export function createInitialGameModel(): GameModel {
  return {
    wallet: INITIAL_WALLET,
    unlockedLevel: 1,
  };
}
