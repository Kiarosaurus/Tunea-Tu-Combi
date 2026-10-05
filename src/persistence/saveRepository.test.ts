import { describe, expect, it } from 'vitest';
import { createInitialGameModel } from '../game/model';
import {
  createSaveData,
  isSaveDataV1,
  LocalSaveRepository,
  SAVE_KEY,
  type StorageLike,
} from './saveRepository';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe('guardado local v1', () => {
  it('serializa, recarga y borra una partida válida', () => {
    const storage = memoryStorage();
    const repository = new LocalSaveRepository(storage);
    const save = createSaveData(createInitialGameModel(), false, '2026-10-05T00:00:00.000Z');
    repository.save(save);
    expect(repository.load()).toEqual(save);
    repository.clear();
    expect(repository.load()).toBeNull();
  });

  it('preserva una cadena corrupta en memoria y permite recuperar el inicio', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '{mal-json');
    const repository = new LocalSaveRepository(storage);
    expect(repository.load()).toBeNull();
    expect(repository.recovered).toBe(true);
    expect(repository.diagnosticRaw).toBe('{mal-json');
    repository.save(createSaveData(createInitialGameModel(), false));
    expect(repository.load()?.wallet).toBe(100);
  });

  it('rechaza dinero negativo, inventario imposible y piezas mal ubicadas', () => {
    const base = createSaveData(createInitialGameModel(), false);
    expect(isSaveDataV1({ ...base, wallet: -1 })).toBe(false);
    expect(isSaveDataV1({ ...base, ownedParts: { ...base.ownedParts, wheel: 1 } })).toBe(false);
    expect(isSaveDataV1({ ...base, workshopBuild: { frontWheel: 'seat' } })).toBe(false);
  });

  it('migra una versión de prueba mínima a v1', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 0, wallet: 73, unlockedLevel: 2 }));
    const repository = new LocalSaveRepository(storage);
    const loaded = repository.load();
    expect(loaded?.version).toBe(1);
    expect(loaded?.wallet).toBe(73);
    expect(loaded?.unlockedLevel).toBe(2);
    expect(JSON.parse(storage.getItem(SAVE_KEY) ?? '{}').version).toBe(1);
  });
});
