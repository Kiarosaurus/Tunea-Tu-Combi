import { LEVELS } from '../data/levels';
import { PART_CATALOG, type PartKind } from '../data/parts';
import {
  ANCHORS,
  createInitialGameModel,
  type AnchorId,
  type GameModel,
  type Inventory,
  type SerializedBuild,
} from '../game/model';

export const SAVE_KEY = 'tunea-tu-combi:save:v1';

export interface SaveDataV1 extends GameModel {
  readonly version: 1;
  readonly settings: {
    readonly masterVolume: number;
    readonly reducedMotion: boolean;
    readonly debugEnabled: boolean;
  };
  readonly updatedAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalSaveRepository {
  readonly #storage: StorageLike;
  diagnosticRaw: string | null = null;
  recovered = false;

  constructor(storage: StorageLike) {
    this.#storage = storage;
  }

  load(): SaveDataV1 | null {
    const raw = this.#storage.getItem(SAVE_KEY);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isSaveDataV1(parsed)) return parsed;
      const migrated = migrateTestSave(parsed);
      if (migrated) {
        this.save(migrated);
        return migrated;
      }
    } catch {
      // Se conserva la cadena original en memoria para diagnóstico local.
    }
    this.diagnosticRaw = raw;
    this.recovered = true;
    return null;
  }

  save(value: SaveDataV1): void {
    if (!isSaveDataV1(value)) throw new Error('El guardado no es válido.');
    this.#storage.setItem(SAVE_KEY, JSON.stringify(value));
  }

  clear(): void {
    this.#storage.removeItem(SAVE_KEY);
    this.diagnosticRaw = null;
    this.recovered = false;
  }
}

export function createSaveData(
  model: GameModel,
  debugEnabled: boolean,
  updatedAt = new Date().toISOString(),
): SaveDataV1 {
  return {
    ...model,
    version: 1,
    settings: { masterVolume: 1, reducedMotion: false, debugEnabled },
    updatedAt,
  };
}

export function isSaveDataV1(value: unknown): value is SaveDataV1 {
  if (!isRecord(value) || value.version !== 1 ||
    !isNonnegativeInteger(value.wallet) ||
    !isLevelNumber(value.unlockedLevel) ||
    !isInventory(value.ownedParts) || !isInventory(value.pendingPurchases) ||
    !isBuild(value.workshopBuild, value.ownedParts) ||
    !isRecord(value.completedLevels) ||
    !isRecord(value.settings) ||
    !isUnitInterval(value.settings.masterVolume) ||
    typeof value.settings.reducedMotion !== 'boolean' ||
    typeof value.settings.debugEnabled !== 'boolean' ||
    typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))) {
    return false;
  }

  const starter = createInitialGameModel().ownedParts;
  for (const part of PART_CATALOG) {
    if (value.ownedParts[part.kind] < starter[part.kind] ||
      value.pendingPurchases[part.kind] > value.ownedParts[part.kind] - starter[part.kind]) {
      return false;
    }
  }

  return Object.entries(value.completedLevels).every(([levelId, result]) =>
    LEVELS.some((level) => level.id === levelId) &&
    isRecord(result) &&
    isNonnegativeInteger(result.bestRevenue) &&
    isNonnegativeInteger(result.bestDelivered) &&
    typeof result.bestSeed === 'string',
  );
}

function isInventory(value: unknown): value is Inventory {
  if (!isRecord(value)) return false;
  return PART_CATALOG.every((part) => isNonnegativeInteger(value[part.kind]));
}

function isBuild(value: unknown, inventory: Inventory): value is SerializedBuild {
  if (!isRecord(value)) return false;
  const placed: Partial<Record<PartKind, number>> = {};
  for (const [anchor, kind] of Object.entries(value)) {
    if (!(anchor in ANCHORS) || ANCHORS[anchor as AnchorId] !== kind) return false;
    placed[kind as PartKind] = (placed[kind as PartKind] ?? 0) + 1;
  }
  return PART_CATALOG.every((part) => (placed[part.kind] ?? 0) <= inventory[part.kind]);
}

function migrateTestSave(value: unknown): SaveDataV1 | null {
  if (!isRecord(value) || value.version !== 0 ||
    !isNonnegativeInteger(value.wallet) ||
    !isLevelNumber(value.unlockedLevel)) {
    return null;
  }
  const initial = createInitialGameModel();
  return createSaveData({ ...initial, wallet: value.wallet, unlockedLevel: value.unlockedLevel }, false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isLevelNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= LEVELS.length;
}
