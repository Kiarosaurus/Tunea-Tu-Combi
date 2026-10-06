import { describe, expect, it } from 'vitest';
import { PART_CATALOG } from '../data/parts';
import {
  buyPart,
  buildStats,
  clearOptionalParts,
  createDemoGameModel,
  createInitialGameModel,
  gridBuildStats,
  gridForModel,
  moveGridPart,
  placeGridPart,
  passengerCapacity,
  placePart,
  removePart,
  returnPurchase,
  sellPart,
  validateBuild,
  validateGridBuild,
} from './model';

describe('taller y economía', () => {
  it('mantiene el catálogo canónico de siete tipos de pieza', () => {
    expect(PART_CATALOG).toHaveLength(7);
  });

  it('entrega un kit funcional sin capacidad extra de pasajeros', () => {
    const initial = createInitialGameModel();
    expect(validateBuild(initial.workshopBuild)).toBeNull();
    expect(initial.ownedParts.wheel).toBe(2);
    expect(passengerCapacity(initial.workshopBuild)).toBe(0);
  });

  it('compra, coloca, retira y devuelve una pieza antes de conducir', () => {
    const initial = createInitialGameModel();
    const purchased = buyPart(initial, 'seat');
    expect(purchased.wallet).toBe(initial.wallet - 15);
    const placed = placePart(purchased, 'seat', 'passengerSeat');
    expect(passengerCapacity(placed.workshopBuild)).toBe(1);
    expect(() => returnPurchase(placed, 'seat')).toThrow('Retira primero');
    const removed = removePart(placed, 'passengerSeat');
    const refunded = returnPurchase(removed, 'seat');
    expect(refunded.wallet).toBe(initial.wallet);
    expect(refunded.ownedParts.seat).toBe(1);
    expect(initial.ownedParts.seat).toBe(1);
  });

  it('rechaza una compra sin fondos y anclajes incorrectos', () => {
    const initial = createInitialGameModel();
    const poor = { ...initial, wallet: 0 };
    expect(() => buyPart(poor, 'engine')).toThrow('Dinero insuficiente');
    expect(() => placePart(initial, 'seat', 'frontWheel')).toThrow('no encaja');
    expect(() => placePart(initial, 'seat', 'passengerSeat')).toThrow('No hay piezas libres');
  });

  it('sólo exige el asiento del conductor y protege el kit básico', () => {
    const initial = createInitialGameModel();
    const removedWheel = removePart(initial, 'frontWheel');
    expect(validateBuild(removedWheel.workshopBuild)).toBeNull();
    const removedSeat = removePart(initial, 'driverSeat');
    expect(validateGridBuild(gridForModel(removedSeat))).toBe('Falta el asiento del conductor.');
    expect(() => sellPart(initial, 'wheel')).toThrow('kit básico');
  });

  it('permite posiciones libres, evita solapamientos y detecta piezas sueltas', () => {
    const initial = createInitialGameModel();
    const withoutEngine = removePart(initial, 'engine');
    const roofEngine = placeGridPart(withoutEngine, 'engine', 4, 0);
    const stats = gridBuildStats(gridForModel(roofEngine));
    expect(stats.loosePieces).toBe(1);
    expect(stats.engineForceN).toBe(0);
    const withExtraSeat = buyPart(roofEngine, 'seat');
    expect(() => placeGridPart(withExtraSeat, 'seat', 4, 0)).toThrow('ocupado');
  });

  it('mueve una pieza colocada sin duplicarla ni consumir inventario', () => {
    const initial = createInitialGameModel();
    const moved = moveGridPart(initial, 'engine-1', 5, 1);
    expect(gridForModel(moved).find((item) => item.id === 'engine-1')).toMatchObject({
      column: 5,
      row: 1,
    });
    expect(gridForModel(moved).filter((item) => item.kind === 'engine')).toHaveLength(1);
    expect(() => moveGridPart(moved, 'engine-1', 3, 3)).toThrow('ocupado');
  });

  it('vende una pieza usada libre con reembolso parcial', () => {
    const initial = createInitialGameModel();
    const purchased = buyPart(initial, 'seat');
    const used = { ...purchased, pendingPurchases: { ...purchased.pendingPurchases, seat: 0 } };
    const sold = sellPart(used, 'seat');
    expect(sold.wallet).toBe(initial.wallet - 15 + 11);
  });

  it('calcula masa y centro de gravedad de una construcción conocida', () => {
    const initialStats = buildStats(createInitialGameModel().workshopBuild);
    expect(initialStats.massKg).toBe(698);
    expect(initialStats.bodyMassKg).toBe(698);
    expect(initialStats.engineForceN).toBe(2200);
    const demoStats = buildStats(createDemoGameModel().workshopBuild);
    expect(demoStats.massKg).toBe(796);
    expect(demoStats.bodyMassKg).toBe(734);
    expect(demoStats.centerOfMass.y).toBeGreaterThan(initialStats.centerOfMass.y);
  });

  it('crea un perfil de demostración completo y sin compras pendientes', () => {
    const demo = createDemoGameModel();
    expect(demo.unlockedLevel).toBe(5);
    expect(validateBuild(demo.workshopBuild)).toBeNull();
    expect(Object.values(demo.pendingPurchases).every((count) => count === 0)).toBe(true);
  });

  it('limpia piezas opcionales sin perder el kit ni el inventario', () => {
    const demo = createDemoGameModel();
    const cleaned = clearOptionalParts(demo);
    expect(validateBuild(cleaned.workshopBuild)).toBeNull();
    expect(cleaned.workshopBuild.roof).toBeUndefined();
    expect(cleaned.ownedParts).toEqual(demo.ownedParts);
  });
});
