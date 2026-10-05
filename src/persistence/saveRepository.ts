export interface SaveRepository<TSave> {
  load(): TSave | null;
  save(value: TSave): void;
  clear(): void;
}

export const SAVE_KEY = 'tunea-tu-combi:save:v1';
